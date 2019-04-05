pragma solidity ^0.4.18;

import "../tokens/ERC20.sol";

interface KyberNetworkProxy {

    function maxGasPrice() external view returns(uint);
    function getUserCapInWei(address user) external view returns(uint);
    function getUserCapInTokenWei(address user, ERC20 token) external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);

    function swapTokenToToken(ERC20 src, uint srcAmount, ERC20 dest, uint minConversionRate) external returns(uint);
    function swapEtherToToken(ERC20 token, uint minConversionRate) external payable returns(uint);
    function swapTokenToEther(ERC20 token, uint srcAmount, uint minConversionRate) external returns(uint);

    function getExpectedRate
    (
        ERC20 src,
        ERC20 dest, 
        uint srcQty
    ) 
        external
        view
        returns 
    (
        uint expectedRate,
        uint slippageRate
    );

    function tradeWithHint
    (
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes hint
    )
        external 
        payable 
        returns(uint);
        
}
