// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

error MockAaveWeth_EthSendWasNotSuccessful();

contract MockAaveWeth is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}

    function mint() public {
        //100 ETH
        _mint(address(this), 100000000000000000000);
    }

    function deposit() external payable {
        //send ETH
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external {
        uint256 _value = 0;
        if (wad > balanceOf(msg.sender)) {
            _value = balanceOf(msg.sender);
        } else {
            _value = wad;
        }

        (bool success, ) = payable(msg.sender).call{value: _value}("");
        if (!success) {
            revert MockAaveWeth_EthSendWasNotSuccessful();
        }
        _burn(msg.sender, _value);
    }
}
