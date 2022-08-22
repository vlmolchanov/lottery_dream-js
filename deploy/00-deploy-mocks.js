const { network, ethers } = require("hardhat");
const {
  developmentChains,
  DECIMALS,
  INITIAL_ANSWER,
} = require("../helper-hardhat-config");

// Parameters for MockV3Aggregator:
/*const DECIMALS = 8;
const INITIAL_ANSWER = 189360777776;*/

// Parameters for VRFCoordinator:
const BASE_FEE = 1;
const GAS_PRICE_LINK = 1;

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  //If we are on a local development network - deploy mocks!
  if (developmentChains.includes(network.name)) {
    log("----------------------------------------------------------");
    log(`Local network = "${network.name}" detected!`);
    log("");
    log(`Deploying Mocks...`);

    // MockV3Aggregator
    // constructor(uint8 _decimals, int256 _initialAnswer)
    await deploy("MockV3Aggregator", {
      from: deployer,
      log: true,
      args: [DECIMALS, INITIAL_ANSWER],
      waitConfirmations: 1,
    });

    // VRFCoordinatorV2Mock
    // constructor(uint96 _baseFee, uint96 _gasPriceLink)
    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: [BASE_FEE, GAS_PRICE_LINK],
      waitConfirmations: 1,
    });

    // MockAavePool
    await deploy("MockAavePool", {
      from: deployer,
      log: true,
      args: [],
      waitConfirmations: 1,
    });

    // MockWeth
    await deploy("MockAaveWeth", {
      from: deployer,
      log: true,
      args: [],
      waitConfirmations: 1,
    });
    const mockAaveWethContract = await ethers.getContract(
      "MockAaveWeth",
      deployer
    );
    await mockAaveWethContract.mint();

    const mockAaveWethBalance = await mockAaveWethContract.balanceOf(
      mockAaveWethContract.address
    );
    const wethBalance = ethers.utils.formatUnits(mockAaveWethBalance, "ether");

    log(`${wethBalance} ETH minted to MockAaveWeth contract`);

    log("Mocks Deployed");
    log("----------------------------------------------------------");
  }
};

module.exports.tags = ["mocks", "all"];
