const networkConfig = {
  default: {
    name: "localhost",
  },
  31337: {
    name: "localhost",
    subscriptionId: "1",
    //keyhash, aavePool and Weth are temporary
    keyHash:
      "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
    aavePoolAddress: "0x3561c45840e2681495ACCa3c50Ef4dAe330c94F8",
    aaveWethAddress: "0x98a5F1520f7F7fb1e83Fe3398f9aBd151f8C65ed",
  },
  4: {
    name: "rinkeby",
    subscriptionId: "3156",
    vrfCoordinatorV2: "0x6168499c0cFfCaCD319c818142124B7A15E857ab",
    ethUsdPriceFeed: "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e",
    keyHash:
      "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
    aavePoolAddress: "0x3561c45840e2681495ACCa3c50Ef4dAe330c94F8",
    aaveWethAddress: "0x98a5F1520f7F7fb1e83Fe3398f9aBd151f8C65ed",
  },
  1: {
    name: "mainnet",
  },
};

const developmentChains = ["hardhat", "localhost"];
const VERIFICATION_BLOCK_CONFIRMATIONS = 6;
const ENTRANCE_FEE = 50;

// Parameters for MockV3Aggregator:
const DECIMALS = 8;
const INITIAL_ANSWER = 189360777776;

module.exports = {
  networkConfig,
  developmentChains,
  VERIFICATION_BLOCK_CONFIRMATIONS,
  ENTRANCE_FEE,
  DECIMALS,
  INITIAL_ANSWER,
};
