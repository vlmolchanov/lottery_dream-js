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

/* Errors */
error Lottery_OnlyOwnerAuthorized();
error Lottery_NotEnoughEthToEnter();
error Lottery_IncorrectRandomNumber();
error Lottery_IncorrectState_OpenRequired();
error Lottery_IncorrectState_CloseRequired();
error Lottery_IncorrectState_CalcWinnerRequired();
error Lottery_IncorrectState_WinnerSelectedRequired();
error Lottery_InsufficientEntranceFee();

/**@title Dream Lottery Contract
 * @author Vladimir Molchanov
 * @notice This contract is updated with Style Guide, Natspec, Solhint linter recomendations, Slither test . Also some other modifications are performed.
 * @dev This implements the Chainlink VRF Version 2. Money are deposited to Aave
 */
contract Lottery is VRFConsumerBaseV2 {
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
    /**
     * @notice Keeping track of ETH send to contract
     */
    event EthReceived(uint256 date, address player, uint256 amount);
    event MoneySentToWinner(uint256 date, address player, uint256 amount);
    event EntranceFeeChanged(uint256 date, uint256 entranceFee, address player);
    event EmrgStopLotteryInitiated(
        uint256 date,
        address player,
        uint256 prizePool
    );

    /* Modifiers */
    /**
     * @notice Only admin is allowed to do this operation
     */
    modifier onlyOwner() {
        if (msg.sender != i_owner) {
            revert Lottery_OnlyOwnerAuthorized();
        }
        _;
    }
    /**
     * @notice Lottery should be started
     */
    modifier lotteryOpen() {
        if (s_lotteryState != LotteryState.OPEN) {
            revert Lottery_IncorrectState_OpenRequired();
        }
        _;
    }
    /**
     * @notice Lottery should be finished
     */
    modifier lotteryClose() {
        if (s_lotteryState != LotteryState.CLOSE) {
            revert Lottery_IncorrectState_CloseRequired();
        }
        _;
    }
    /**
     * @notice Lottery should be in process of calculating winner
     */
    modifier lotteryCalculatingWinner() {
        if (s_lotteryState != LotteryState.CALCULATING_WINNER) {
            revert Lottery_IncorrectState_CalcWinnerRequired();
        }
        _;
    }
    /**
     * @notice Lottery should select winner
     */
    modifier lotteryWinnerSelected() {
        if (s_lotteryState != LotteryState.WINNER_SELECTED) {
            revert Lottery_IncorrectState_WinnerSelectedRequired();
        }
        _;
    }

    /* Functions */
    constructor(
        uint256 _entranceFee,
        address _priceFeedAddress,
        address _vrfCoordinator,
        address _aavePoolAddress,
        address _wethContractAddress,
        uint64 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2(_vrfCoordinator) {
        if (_entranceFee < 1) {
            revert Lottery_InsufficientEntranceFee();
        }
        s_entranceFeeUSD = _entranceFee;
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

    /**
     * @dev Contract is changing WETH to ETH, so it should be capable of receiving ETH
     */
    receive() external payable {
        emit EthReceived(block.timestamp, msg.sender, msg.value);
    }

    fallback() external payable {}

    // External functions

    /// Public functions

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

    /// Only admin
    /**
     * @notice This version of contract waits Admin to start lottery manually
     */
    function startLottery() public lotteryClose onlyOwner {
        s_players = new address payable[](0);
        s_recentWinner = payable(address(0));
        s_prizePool = 0;
        s_lotteryState = LotteryState.OPEN;
    }

    /**
     * @notice This version of contract waits Admin to end lottery manually
     */
    function endLottery() public lotteryOpen onlyOwner {
        s_lotteryState = LotteryState.CALCULATING_WINNER;
        requestRandomWords();
    }

    /**
     * @notice 1. Withdraw all funds from Aave
     * @notice 2. Change to ETH
     * @notice 3. Send to owner
     * @dev This is the function to emergency stop Lottery if smth wrong
     */
    function emrgStopLottery() public onlyOwner {
        uint256 bigValue = 100 * 10**18;
        withdrawAaveFunds(bigValue);
        uint256 wethBalance = i_wethContract.balanceOf(address(this));
        changeToEth(wethBalance);
        s_lotteryState = LotteryState.CLOSE;
        payable(i_owner).transfer(address(this).balance);
        emit EmrgStopLotteryInitiated(block.timestamp, msg.sender, s_prizePool);
    }

    function transferFundsToWinner() public lotteryWinnerSelected onlyOwner {
        withdrawAaveFunds(s_prizePool);
        changeToEth(s_prizePool);
        s_lotteryState = LotteryState.CLOSE;
        s_recentWinner.transfer(s_prizePool);
        emit MoneySentToWinner(block.timestamp, s_recentWinner, s_prizePool);
    }

    /**
     * @notice This version of contract allows to change entrance fee
     * @notice Entrance fee is set in USD
     */
    function setEntranceFee(uint256 value) public lotteryClose onlyOwner {
        if (value < 1) {
            revert Lottery_InsufficientEntranceFee();
        }
        s_entranceFeeUSD = value;
        emit EntranceFeeChanged(block.timestamp, s_entranceFeeUSD, msg.sender);
    }

    // Internal functions
    /**
     * @notice Assumes the subscription is funded.
     */
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

    /**
     * @dev Contract is called by VRFConsumerBaseV2 and provide Random words
     * @inheritdoc VRFConsumerBaseV2
     */
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

    // Private

    // View/pure

    function getEntranceFeeUSD() public view returns (uint256) {
        return s_entranceFeeUSD;
    }

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

    function getOwner() public view returns (address) {
        return i_owner;
    }

    /// Admin
    /**
     * @dev Gives ability to admin to check Aave balance
     */
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
}
