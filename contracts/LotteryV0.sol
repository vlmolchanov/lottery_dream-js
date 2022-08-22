//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "../interfaces/IPool.sol";

//import "../interfaces/IWeth.sol";

interface IWeth {
    function balanceOf(address owner) external view returns (uint256 balance);

    function approve(address spender, uint256 value)
        external
        returns (bool success);

    function deposit() external payable;

    function transfer(address to, uint value) external returns (bool);

    function withdraw(uint) external;
}

contract LotteryV0 is VRFConsumerBaseV2 {
    uint256 public constant entranceFeeUSD = 50;
    uint256 public prizePool;

    address payable[] public players;
    address payable public recentWinner;
    address public owner;
    mapping(address => uint256) public playerDeposit;

    enum LOTTERY_STATE {
        OPEN,
        CLOSE,
        CALCULATING_WINNER,
        WINNER_SELECTED
    }
    LOTTERY_STATE public lottery_state;

    //****Random number params
    //Our subscription ID.
    uint64 subscriptionId;
    bytes32 keyHash;
    uint32 callbackGasLimit = 100000;
    uint16 requestConfirmations = 3;
    uint32 numWords = 1;
    //*****

    uint256[] public randomWords;

    AggregatorV3Interface priceFeed;
    VRFCoordinatorV2Interface vrfCoordinator;
    IPool aavePool;
    IWeth wethContract;

    event NewPlayer(
        uint256 date,
        address player,
        uint256 amount,
        uint256 prizePool
    );
    event RandomRequestSent(uint256 date, uint256 requestId);
    event RandomNumberReceived(
        uint256 date,
        uint256 randomNumber,
        uint256 recentWinnerIndex,
        address recentWinner
    );
    event EthReceived(uint256 date, address player, uint256 amount);
    event MoneySentToWinner(uint256 date, address player, uint256 amount);

    constructor(
        address _priceFeedAddress,
        address _vrfCoordinator,
        address _aavePoolAddress,
        address _wethContractAddress,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        lottery_state = LOTTERY_STATE.CLOSE;
        owner = msg.sender;
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        aavePool = IPool(_aavePoolAddress);
        wethContract = IWeth(_wethContractAddress);
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
    }

    receive() external payable {
        emit EthReceived(block.timestamp, msg.sender, msg.value);
    }

    fallback() external payable {}

    //Show actual entrance fee in wei
    function getEntranceFee() public view returns (uint256) {
        //50*10^(8+18)/3000*10^8 to have answer in wei
        (, int256 conversionRate, , , ) = priceFeed.latestRoundData();
        return (entranceFeeUSD * 10**26) / uint256(conversionRate);
    }

    //Show number of participants
    function getPlayersNumber() public view returns (uint256) {
        return players.length;
    }

    function enterLottery() public payable lotteryOpen {
        require(msg.value >= getEntranceFee(), "Not enough ETH to enter!");
        players.push(payable(msg.sender));
        playerDeposit[msg.sender] += msg.value;
        wethContract.deposit{value: msg.value}();
        supplyFundsAave(msg.value);
        prizePool += msg.value;
        emit NewPlayer(block.timestamp, msg.sender, msg.value, prizePool);
    }

    //*****Admin functions *********************************
    function startLottery() public lotteryClose onlyOwner {
        for (uint256 i = 1; i < players.length; i++) {
            address player = players[i];
            playerDeposit[player] = 0;
        }
        players = new address payable[](0);
        recentWinner = payable(address(0));
        prizePool = 0;
        lottery_state = LOTTERY_STATE.OPEN;
    }

    function endLottery() public lotteryOpen onlyOwner {
        lottery_state = LOTTERY_STATE.CALCULATING_WINNER;
        requestRandomWords();
    }

    function emrgStopLottery() public onlyOwner {
        uint256 bigValue = 100 * 10**18;
        withdrawAaveFunds(bigValue);
        uint256 wethBalance = wethContract.balanceOf(address(this));
        changeToEth(wethBalance);
        payable(owner).transfer(address(this).balance);
        lottery_state = LOTTERY_STATE.CLOSE;
    }

    function transferFundsToWinner() public lotteryWinnerSelected onlyOwner {
        withdrawAaveFunds(prizePool);
        changeToEth(prizePool);
        recentWinner.transfer(prizePool);
        lottery_state = LOTTERY_STATE.CLOSE;
        emit MoneySentToWinner(block.timestamp, recentWinner, prizePool);
    }

    function checkAaveBalance()
        public
        view
        onlyOwner
        returns (uint256, uint256)
    {
        (
            uint256 total_collateral_base,
            uint256 total_debt_base,
            ,
            ,
            ,

        ) = aavePool.getUserAccountData(address(this));
        return (total_collateral_base, total_debt_base);
    }

    function transferFundsToAdmin() public lotteryClose onlyOwner {
        //Try big value
        uint256 bigNumber = 10**18;
        withdrawAaveFunds(bigNumber);
        //Convert WETH to ETH
        uint256 value = wethContract.balanceOf(address(this));
        changeToEth(value);
        //Send all Eth to owner
        payable(owner).transfer(address(this).balance);
    }

    //***********Internal functions ********************
    // Assumes the subscription is funded sufficiently.
    function requestRandomWords() internal onlyOwner {
        // Will revert if subscription is not set and funded.

        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        emit RandomRequestSent(block.timestamp, requestId);
    }

    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory _randomWords
    ) internal override {
        require(
            lottery_state == LOTTERY_STATE.CALCULATING_WINNER,
            "Lottery is not in correct state"
        );
        randomWords = _randomWords;
        require(randomWords[0] > 0, "Random number should be > 0");
        uint256 recentWinnerIndex = randomWords[0] % players.length;
        recentWinner = players[recentWinnerIndex];
        lottery_state = LOTTERY_STATE.WINNER_SELECTED;
        emit RandomNumberReceived(
            block.timestamp,
            randomWords[0],
            recentWinnerIndex,
            recentWinner
        );
    }

    function supplyFundsAave(uint256 amount) internal {
        wethContract.approve(address(aavePool), amount);
        aavePool.supply(address(wethContract), amount, address(this), 0);
    }

    //!!!!!!!!!!!!!!!
    function withdrawAaveFunds(uint256 amount) public {
        wethContract.approve(address(aavePool), amount);
        aavePool.withdraw(address(wethContract), amount, address(this));
    }

    function changeToEth(uint256 _value) internal {
        wethContract.approve(address(this), _value);
        wethContract.withdraw(_value);
    }

    //********************Modifiers****************
    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "Only admin is allowed to do this operation"
        );
        _;
    }

    modifier lotteryOpen() {
        require(
            lottery_state == LOTTERY_STATE.OPEN,
            "Lottery should be started"
        );
        _;
    }

    modifier lotteryClose() {
        require(
            lottery_state == LOTTERY_STATE.CLOSE,
            "Lottery should be finished"
        );
        _;
    }

    modifier lotteryCalculatingWinner() {
        require(
            lottery_state == LOTTERY_STATE.CALCULATING_WINNER,
            "Lottery should selecting winner"
        );
        _;
    }

    modifier lotteryWinnerSelected() {
        require(
            lottery_state == LOTTERY_STATE.WINNER_SELECTED,
            "Lottery should select winner"
        );
        _;
    }
}
