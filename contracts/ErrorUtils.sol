pragma solidity 0.4.24;

/**
 * @author Rohit Soni (rohit@nuofox.com)
 */
 
contract ErrorUtils {

    event LogError(string methodSig, string errMsg);
    event LogErrorWithHintBytes32(bytes32 indexed bytes32Value, string methodSig, string errMsg);
    event LogErrorWithHintAddress(address indexed addressValue, string methodSig, string errMsg);

}