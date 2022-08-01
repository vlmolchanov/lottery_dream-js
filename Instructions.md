1. Install a hardhat with "yarn add --dev hardhat"
2. Start a new project "yarn hardhat"
3. Install dependencies "yarn add --dev":
   - "@nomiclabs/hardhat-ethers" : This plugin brings to Hardhat the Ethereum library ethers.js, which allows you to interact with the Ethereum blockchain in a simple way.
     To use it in a "hardhat.config.js" add "@nomiclabs/hardhat-ethers"
     https://www.npmjs.com/package/@nomiclabs/hardhat-ethers
   - "@npm:hardhat-deploy-ethers": This plugin brings to Hardhat the Ethereum library ethers.js, which allows you to interact with the Ethereum blockchain in a simple way. It adds extra functionality and the ability to get signer from address string
     To use it in a "hardhat.config.js" add "require("hardhat-deploy-ethers")"
     It also automatically integrate with the hardhat-deploy plugin if detected
     const contract = await hre.ethers.getContract('<deploymentName>');
     https://www.npmjs.com/package/hardhat-deploy-ethers
     CORRECT CMD for two above: yarn add @nomiclabs/hardhat-ethers@npm:hardhat-deploy-ethers
   - "ethers": A complete Ethereum wallet implementation and utilities in JavaScript
     https://yarnpkg.com/package/ethers#readme
   - "@nomiclabs/hardhat-etherscan": Hardhat plugin for integration with Etherscan's contract verification service.
     To use it in a "hardhat.config.js" add "require("@nomiclabs/hardhat-etherscan")"
     https://www.npmjs.com/package/@nomiclabs/hardhat-etherscan
   - "@nomiclabs/hardhat-waffle": Hardhat plugin for integration with Waffle. You can use this plugin to build smart contract tests using Waffle in Hardhat, taking advantage of both.
     To use it in a "hardhat.config.js" add "require("@nomiclabs/hardhat-waffle")"
     https://www.npmjs.com/package/@nomiclabs/hardhat-waffle
   - "chai" BDD/TDD assertion library for node.js and the browser. Test framework agnostic.
     https://yarnpkg.com/package/chai#readme
   - "ethereum-waffle"
     https://yarnpkg.com/package/ethereum-waffle#readme
   - "hardhat"
     https://yarnpkg.com/package/hardhat#readme
   - "hardhat-contract-sizer" : Output Solidity contract sizes with Hardhat
     https://yarnpkg.com/package/hardhat-contract-sizer#readme
   - "hardhat-deploy" : Hardhat Plugin For Replicable Deployments And Tests. This hardhat plugin adds a mechanism to deploy contracts to any network, keeping track of them and replicating the same environment for testing.
     https://yarnpkg.com/package/hardhat-deploy
   - "hardhat-gas-reporter": Hardhat plugin for eth-gas-reporter, a mocha reporter for Ethereum test suites
     https://yarnpkg.com/package/hardhat-gas-reporter
     https://www.npmjs.com/package/hardhat-gas-reporter
   - "prettier": Prettier is an opinionated code formatter
     https://yarnpkg.com/package/prettier
   - "prettier-plugin-solidity": A Prettier Plugin for automatically formatting your Solidity code
     https://yarnpkg.com/package/prettier-plugin-solidity
   - "solhint": Solidity Code Linter (check code)
     https://yarnpkg.com/package/solhint
   - "solidity-coverage": Shows test coverage of code
     https://yarnpkg.com/package/solidity-coverage#readme
   - "dotenv": Loads environment variables from .env file. Dotenv is a zero-dependency module that loads environment variables from a .env file into process.env
     https://yarnpkg.com/package/dotenv
4. Install hardhat-shorthand with "yarn global add hardhat-shorthand". In my case it's not working...
   Instead in package.json added
   "scripts": {
   "hh": "hardhat"
   },"
   Now cmd to compile: "yarn hh compile"
5. Create contracts folder
6. To use "import @chainlink" we need to import it first with "yarn add --dev @chainlink/contracts"
7. Create "deploy" folder and deploy script for "Mocks" contracts: "00-deploy-mocks.js"

   - Here we need to say some words about "deploy". This cmd can be used after package hardhat-deploy is installed. It gives us cmds "deploy" and "node".

   Shortest version of deploy cmd is:
   module.exports = async () => {
   console.log("Hi!");
   };
   Cmd to run it: yarn hh deploy. This cmd runs all files in

   Also we can specify a tag like "module.exports.tags = ["mocks"];" and then run it with "yarn hh deploy --tags mocks"

   Additionally we can specify network: yarn hh deploy --tags mocks --network rinkeby

   - Networks are listed in hardhat.config.js:
     networks: {
     rinkeby: {
     url: "https://eth-rinkeby.alchemyapi.io/v2/9cqiZ2DobB1aUyEa_MYUq3t9e1Zd-CHM",
     accounts: [
     "0x0dffe43db78484dc90711168c0eefe958afed33ac3ff43220c3563071611bb97",
     ],
     chainId: 4,
     },
     },

   - And to deploy contract we need an account to deploy. With hardhat-deploy package we have "getNamedAccount" function. It can use different accounts. For this purpose it checks setting in hardhat.config.js:
     namedAccounts: {
     deployer: {
     default: 0, // here this will by default take the first account as deployer
     1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
     },
     player: {
     default: 1,
     },
     },

   Accounts should be listed in networks config (it's waiting for an array []: accounts: ["0x0dffe43db78484dc90711168c0eefe958afed33ac3ff43220c3563071611bb97",])
