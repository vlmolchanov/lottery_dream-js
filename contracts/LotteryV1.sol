//SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "../interfaces/IPool.sol";

interface IWeth {
    function balanceOf(address owner) external view returns (uint256 balance);

    function approve(address spender, uint256 value)
        external
        returns (bool success);

    function deposit() external payable;

    function transfer(address to, uint value) external returns (bool);

    function withdraw(uint) external;
}

// Errors
error Lottery_OnlyOwnerAuthorized();
error Lottery_NotEnoughEthToEnter();
error Lottery_IncorrectRandomNumber();
error Lottery_IncorrectState_OpenRequired();
error Lottery_IncorrectState_CloseRequired();
error Lottery_IncorrectState_CalcWinnerRequired();
error Lottery_IncorrectState_WinnerSelectedRequired();
error Lottery_InsufficientEntranceFee();

/**@title A sample Lottery Contract
 * @author Vladimir Molchanov
 * @notice This contract is for creating a sample lottery contract. V2 updates require to errors and some other updates
 * Updates saved gas 2089080 (Lottery) vs 2681167 (LotteryV0)
 * @dev This implements the Chainlink VRF Version 2
 */
contract LotteryV1 is VRFConsumerBaseV2 {
    /* Type declarations */
    enum LotteryState {
        OPEN,
        CLOSE,
        CALCULATING_WINNER,
        WINNER_SELECTED
    }

    /* State variables */
    // Aggregator V3
    AggregatorV3Interface private immutable i_priceFeed;

    // Chainlink VRF Variables
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    uint64 private immutable i_subscriptionId;
    bytes32 private immutable i_keyHash;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    // Aave Pool
    IPool private immutable i_aavePool;
    IWeth private immutable i_wethContract;

    // Lottery Variables
    uint256 private s_entranceFeeUSD;
    uint256 private s_prizePool;
    address private immutable i_owner;
    address payable[] private s_players;
    address payable private s_recentWinner;
    LotteryState public s_lotteryState;

    /* Events */
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

    /* Functions */
    constructor(
        address _priceFeedAddress,
        address _vrfCoordinator,
        address _aavePoolAddress,
        address _wethContractAddress,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        s_entranceFeeUSD = 50;
        s_lotteryState = LotteryState.CLOSE;
        i_owner = msg.sender;
        i_priceFeed = AggregatorV3Interface(_priceFeedAddress);
        i_vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        i_subscriptionId = _subscriptionId;
        i_keyHash = _keyHash;
        i_callbackGasLimit = 100000;
        i_aavePool = IPool(_aavePoolAddress);
        i_wethContract = IWeth(_wethContractAddress);
    }

    receive() external payable {
        emit EthReceived(block.timestamp, msg.sender, msg.value);
    }

    fallback() external payable {}

    /* Admin functions */
    function startLottery() public lotteryClose onlyOwner {
        s_players = new address payable[](0);
        s_recentWinner = payable(address(0));
        s_prizePool = 0;
        s_lotteryState = LotteryState.OPEN;
    }

    function endLottery() public lotteryOpen onlyOwner {
        s_lotteryState = LotteryState.CALCULATING_WINNER;
        requestRandomWords();
    }

    /**
     * @dev This is the function to emergency stop Lottery if smth wrong
     * 1. Withdraw all funds from Aave
     * 2. Change to ETH
     * 3. Send to owner
     */
    function emrgStopLottery() public onlyOwner {
        uint256 bigValue = 100 * 10**18;
        withdrawAaveFunds(bigValue);
        uint256 wethBalance = i_wethContract.balanceOf(address(this));
        changeToEth(wethBalance);
        payable(i_owner).transfer(address(this).balance);
        s_lotteryState = LotteryState.CLOSE;
    }

    function transferFundsToWinner() public lotteryWinnerSelected onlyOwner {
        withdrawAaveFunds(s_prizePool);
        changeToEth(s_prizePool);
        s_recentWinner.transfer(s_prizePool);
        s_lotteryState = LotteryState.CLOSE;
        emit MoneySentToWinner(block.timestamp, s_recentWinner, s_prizePool);
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

        ) = i_aavePool.getUserAccountData(address(this));
        return (total_collateral_base, total_debt_base);
    }

    function setEntranceFee(uint256 value) public lotteryClose onlyOwner {
        if (value < 1) {
            revert Lottery_InsufficientEntranceFee();
        }
        s_entranceFeeUSD = value;
    }

    /* Internal functions */
    // Assumes the subscription is funded sufficiently.
    function requestRandomWords() internal onlyOwner {
        // Revert if subscription is not set and funded.
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RandomRequestSent(block.timestamp, requestId);
    }

    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        if (s_lotteryState != LotteryState.CALCULATING_WINNER) {
            revert Lottery_IncorrectState_CalcWinnerRequired(); // "Lottery is not in correct state"
        }
        if (randomWords[0] <= 0) {
            revert Lottery_IncorrectRandomNumber(); // "Random number should be > 0"
        }
        uint256 recentWinnerIndex = randomWords[0] % s_players.length;
        s_recentWinner = s_players[recentWinnerIndex];
        s_lotteryState = LotteryState.WINNER_SELECTED;
        emit RandomNumberReceived(
            block.timestamp,
            randomWords[0],
            recentWinnerIndex,
            s_recentWinner
        );
    }

    function supplyFundsAave(uint256 amount) internal {
        i_wethContract.approve(address(i_aavePool), amount);
        i_aavePool.supply(address(i_wethContract), amount, address(this), 0);
    }

    function withdrawAaveFunds(uint256 amount) internal {
        i_wethContract.approve(address(i_aavePool), amount);
        i_aavePool.withdraw(address(i_wethContract), amount, address(this));
    }

    function changeToEth(uint256 amount) internal {
        i_wethContract.approve(address(this), amount);
        i_wethContract.withdraw(amount);
    }

    /* Public Functions */
    function enterLottery() public payable lotteryOpen {
        if (msg.value < getEntranceFee()) {
            revert Lottery_NotEnoughEthToEnter(); // "Not enough ETH to enter!"
        }
        i_wethContract.deposit{value: msg.value}();
        supplyFundsAave(msg.value);
        s_prizePool += msg.value;
        s_players.push(payable(msg.sender));
        emit NewPlayer(block.timestamp, msg.sender, msg.value, s_prizePool);
    }

    /* Getter Functions */

    /**
     * @dev This is the function to show actual entrance fee in wei
     */
    function getEntranceFee() public view returns (uint256) {
        //50*10^(8+18)/3000*10^8 to have answer in wei
        (, int256 conversionRate, , , ) = i_priceFeed.latestRoundData();
        return (s_entranceFeeUSD * 10**26) / uint256(conversionRate);
    }

    function getPrizePool() public view returns (uint256) {
        return s_prizePool;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getPlayersNumber() public view returns (uint256) {
        return s_players.length;
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function getLotteryState() public view returns (LotteryState) {
        return s_lotteryState;
    }

    /* Modifiers */
    modifier onlyOwner() {
        if (msg.sender != i_owner) {
            revert Lottery_OnlyOwnerAuthorized(); // "Only admin is allowed to do this operation"
        }
        _;
    }

    modifier lotteryOpen() {
        if (s_lotteryState != LotteryState.OPEN) {
            revert Lottery_IncorrectState_OpenRequired(); // "Lottery should be started"
        }
        _;
    }

    modifier lotteryClose() {
        if (s_lotteryState != LotteryState.CLOSE) {
            revert Lottery_IncorrectState_CloseRequired(); // "Lottery should be finished"
        }
        _;
    }

    modifier lotteryCalculatingWinner() {
        if (s_lotteryState != LotteryState.CALCULATING_WINNER) {
            revert Lottery_IncorrectState_CalcWinnerRequired(); // "Lottery should be in process of calculating winner"
        }
        _;
    }

    modifier lotteryWinnerSelected() {
        if (s_lotteryState != LotteryState.WINNER_SELECTED) {
            revert Lottery_IncorrectState_WinnerSelectedRequired(); // "Lottery should select winner"
        }
        _;
    }
}
