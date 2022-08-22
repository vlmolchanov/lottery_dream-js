const { ethers, network } = require("hardhat");
const fs = require("fs");

const FRONT_END_ADDRESSES_FILE =
  "../nextjs_lottery_dream/constants/contractAddresses.json";
const FRONT_END_ABI_FILE = "../nextjs_lottery_dream/constants/abi.json";

module.exports = async function () {
  if (process.env.UPDATE_FRONT_END) {
    console.log("Updating front end...");

    //updateAbi();
    const lottery = await ethers.getContract("Lottery");
    fs.writeFileSync(
      FRONT_END_ABI_FILE,
      lottery.interface.format(ethers.utils.FormatTypes.json)
    );

    //updateContractAddresses();
    const chainId = network.config.chainId.toString();
    const contractAddresses = JSON.parse(
      fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8")
    );
    if (chainId in contractAddresses) {
      if (!contractAddresses[chainId].includes(lottery.address)) {
        contractAddresses[chainId].push(lottery.address);
      }
    }
    {
      contractAddresses[chainId] = [lottery.address];
    }
    fs.writeFileSync(
      FRONT_END_ADDRESSES_FILE,
      JSON.stringify(contractAddresses)
    );

    console.log("Front end written!");
  }
};

async function updateAbi() {
  const lottery = await ethers.getContract("Lottery");
  fs.writeFileSync(
    FRONT_END_ABI_FILE,
    lottery.interface.format(ethers.utils.FormatTypes.json)
  );
}

async function updateContractAddresses() {
  const chainId = network.config.chainId.toString();
  const lottery = await ethers.getContract("Lottery");
  const contractAddresses = JSON.parse(
    fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8")
  );
  if (chainId in contractAddresses) {
    if (!contractAddresses[chainId].includes(lottery.address)) {
      contractAddresses[chainId].push(lottery.address);
    }
  }
  {
    contractAddresses[chainId] = [lottery.address];
  }
  fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(contractAddresses));
}

module.exports.tags = ["all", "frontend"];
