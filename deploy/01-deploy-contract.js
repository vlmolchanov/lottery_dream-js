const { network, ethers } = require("hardhat");
const {
  networkConfig,
  developmentChains,
  VERIFICATION_BLOCK_CONFIRMATIONS,
  ENTRANCE_FEE,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

// Parameters for VRFCoordinator:
const FUND_AMOUNT = "1000000000000000000000";

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  const waitBlockConfirmations = developmentChains.includes(network.name)
    ? 1
    : VERIFICATION_BLOCK_CONFIRMATIONS;

  /*   const [, answer, , ,] = await mockContract.latestRoundData();
  console.log(answer.toString()); */
  let subscriptionId,
    vrfCoordinatorV2Address,
    priceFeedAddress,
    aavePoolAddress,
    aaveWethAddress;

  // On development chain we create and fund subscription
  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock",
      deployer
    );
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;

    const priceFeedMock = await ethers.getContract(
      "MockV3Aggregator",
      deployer
    );
    priceFeedAddress = priceFeedMock.address;

    aavePoolAddress = (await ethers.getContract("MockAavePool")).address;

    aaveWethAddress = (await ethers.getContract("MockAaveWeth")).address;

    log("Create and Fund subscription for vrfCoordinator on a local network");

    // Create subscription for vrfCoordinatorV2Mock
    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await transactionResponse.wait();
    subscriptionId = transactionReceipt.events[0].args.subId;
    log(`Subscription Id = ${subscriptionId}`);

    // Fund subscription for vrfCoordinatorV2Mock
    await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT);
    log("Subscription is funded");
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
    priceFeedAddress = networkConfig[chainId]["ethUsdPriceFeed"];
    aavePoolAddress = networkConfig[chainId]["aavePoolAddress"];
    aaveWethAddress = networkConfig[chainId]["aaveWethAddress"];
  }

  log("----------------------------------------------------------");
  // Deploy lottery
  // constructor(address _priceFeedAddress, address _vrfCoordinator, address _aavePoolAddress,
  // address _wethContractAddress, uint64 _subscriptionId, bytes32 _keyHash)
  const arguments = [
    ENTRANCE_FEE,
    priceFeedAddress,
    vrfCoordinatorV2Address,
    aavePoolAddress,
    aaveWethAddress,
    subscriptionId,
    networkConfig[chainId]["keyHash"],
  ];

  const lottery = await deploy("Lottery", {
    from: deployer,
    args: arguments,
    log: true,
    waitConfirmations: waitBlockConfirmations,
  });

  // Verify the deployment
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying...");
    await verify(lottery.address, arguments);
  }
};

module.exports.tags = ["lottery", "all"];
