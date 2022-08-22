// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

contract MockAavePool {
    mapping(address => uint256) public totalCollateralBase;
    mapping(address => uint256) public totalDebtBase;

    function getUserAccountData(address user)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (totalCollateralBase[user], totalDebtBase[user], 1, 1, 1, 1);
    }

    function supply(
        address, /*asset*/
        uint256 amount,
        address onBehalfOf,
        uint16 /*referralCode*/
    ) external {
        totalCollateralBase[onBehalfOf] += amount;
    }

    function withdraw(
        address, /*asset*/
        uint256 amount,
        address /*to*/
    ) external returns (uint256) {
        if (amount > totalCollateralBase[msg.sender]) {
            amount = totalCollateralBase[msg.sender];
        }
        totalCollateralBase[msg.sender] -= amount;

        return amount;
    }
}
