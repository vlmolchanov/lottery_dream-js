const { ethers } = require("hardhat");

async function enterLottery() {
  const lottery = await ethers.getContract("Lottery");
  const entranceFee = await lottery.getEntranceFee();
  console.log(`Entrance fee is ${entranceFee}`);
  await lottery.enter({ value: entranceFee + 1 });
  console.log("Entered!");
}

enterLottery()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
