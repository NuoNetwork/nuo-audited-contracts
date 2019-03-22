const helpers = require("./helpers.js");

const Reserve = artifacts.require("Reserve.sol");
const MockAccountFactory = artifacts.require("MockAccountFactory.sol");
const MockConfig = artifacts.require("MockConfig.sol");
const MockAccount = artifacts.require("MockAccount.sol");
const MockEscrowReserve = artifacts.require("MockEscrow.sol");
const MockEscrowKernel = artifacts.require("MockEscrow.sol");
const DateTime = artifacts.require("DateTime");

const ReserveToken = artifacts.require("TestToken.sol");

const signTypeMeta = {
    createOrder : ["address","address","uint256","uint256","uint256"],
    cancelOrder: ["bytes32", "string"]
};

contract("Reserve", (accounts) => {

    const acc0 = accounts[0]; // relayer
    const acc1 = accounts[1]; // user

    let config;
    let accountFactory;
    let reserveEscrow;
    let reserveToken;
    let reserve;

    before( async () => {
        config = await MockConfig.new();
        accountFactory = await MockAccountFactory.new();
        reserveEscrow = await MockEscrowReserve.new();
        dateTime = await DateTime.new();
        reserve = await Reserve.new(reserveEscrow.address, accountFactory.address, dateTime.address, config.address);
        account = await MockAccount.new();
    });
    
    beforeEach(async () => {
        reserveToken = await ReserveToken.new();
        await accountFactory.useDefaults();
    });

    it("should create reserve order", async() => {
        let reserveValue = web3.toWei(1, "ether"); 
        
        await reserveToken.transfer(account.address, reserveValue);

        let initAccBal = await reserveToken.balanceOf(account.address);
        let initReserveEscrowBal = await reserveToken.balanceOf(reserveEscrow.address);

        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();

        // account, reserveToken, byUser
        let orderAddr = [account.address, reserveToken.address, acc1];
        // reserveValue, duration, salt
        let orderValues = [reserveValue, duration, salt];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // account, reserveToken, reserveValue, duration, salt
        let dataToSign = [account.address, reserveToken.address, reserveValue, duration, salt];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(result.sign);

        await reserve.createOrder(...dataForCall);

        let finalAccBal = await reserveToken.balanceOf(account.address);
        let finalReserveEscrowBal = await reserveToken.balanceOf(reserveEscrow.address);
        
        let diffAccBal = initAccBal.minus(finalAccBal);
        let diffReserveEscrowBal = finalReserveEscrowBal.minus(initReserveEscrowBal);

        assert.isTrue(await reserve.isOrder(result.hash), "order not available");
        assert.isTrue(diffAccBal.eq(reserveValue), "erc20 transfer from account failed");
        assert.isTrue(diffReserveEscrowBal.eq(reserveValue), "erc20 transfer to reserve escrow failed");
    });
    
    it("should cancel reserve order", async() => {
        let reserveValue = web3.toWei(1, "ether"); 
        
        await reserveToken.transfer(account.address, reserveValue);

        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();

        // account, reserveToken, byUser
        let orderAddr = [account.address, reserveToken.address, acc1];
        // reserveValue, duration, salt
        let orderValues = [reserveValue, duration, salt];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // account, reserveToken, reserveValue, duration, salt
        let dataToSign = [account.address, reserveToken.address, reserveValue, duration, salt];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(result.sign);

        await reserve.createOrder(...dataForCall);

        let orderHash = result.hash;
        
        assert.isFalse(await reserve.cancelledOrders(orderHash), "order already cancelled, invalid state");

        let initAccBal = await reserveToken.balanceOf(account.address);
        let initReserveEscrowBal = await reserveToken.balanceOf(reserveEscrow.address);

        let dataForCancel = [orderHash, "CANCEL_RESERVE_ORDER"];    
        result = await helpers.generateAndSignHash(acc1, signTypeMeta["cancelOrder"], dataForCancel); 

        dataForCancel.pop();
        dataForCancel.push(result.sign);
       
        await reserve.cancelOrder(...dataForCancel);

        let finalAccBal = await reserveToken.balanceOf(account.address);
        let finalReserveEscrowBal = await reserveToken.balanceOf(reserveEscrow.address);
        
        let diffAccBal = finalAccBal.minus(initAccBal);
        let diffReserveEscrowBal = initReserveEscrowBal.minus(finalReserveEscrowBal);

        assert.isTrue(await reserve.cancelledOrders(orderHash), "order not cancelled");
        assert.isTrue(diffAccBal.eq(reserveValue), "erc20 transfer from account failed");
        assert.isTrue(diffReserveEscrowBal.eq(reserveValue), "erc20 transfer to reserve escrow failed");
    });

    
    it("should distribute profits to order", async() => {
        let reserveValue = web3.toWei(1, "ether"); 
        let profitValue = web3.toWei(0.2, "ether"); 
        let sumReserveAndProfitValue = web3.toWei(1.2, "ether"); 
        
        await reserveToken.transfer(account.address, reserveValue);

        let duration = 10 * 86400; // 10 days
        let salt = helpers.generateRandomNumber();

        // account, reserveToken, byUser
        let orderAddr = [account.address, reserveToken.address, acc1];
        // reserveValue, duration, salt
        let orderValues = [reserveValue, duration, salt];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // account, reserveToken, reserveValue, duration, salt
        let dataToSign = [account.address, reserveToken.address, reserveValue, duration, salt];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(result.sign);

        await reserve.createOrder(...dataForCall);

        let orderHash = result.hash;
        
        // simulating loan issuance and repayment
        // loan tokens
        await reserve.release(reserveToken.address, account.address, reserveValue);
        await helpers.increaseGanacheBlockTime(1 * 86400); // 1 days
        // xfer profit to account
        await reserveToken.transfer(account.address, profitValue);
        // loan repaid 
        await reserve.lock(reserveToken.address, account.address, sumReserveAndProfitValue, profitValue, 0);
        await helpers.increaseGanacheBlockTime(1 * 86400); // 1 days

        // reserve values and order calculations
        await reserve.updateReserveValues(reserveToken.address, 5);
        await reserve.updateOrderCumulativeValue(orderHash, 1);

        let initAccBal = await reserveToken.balanceOf(account.address);
        let initReserveEscrowBal = await reserveToken.balanceOf(reserveEscrow.address);

        let dataForCancel = [orderHash, "CANCEL_RESERVE_ORDER"];    
        result = await helpers.generateAndSignHash(acc1, signTypeMeta["cancelOrder"], dataForCancel); 

        dataForCancel.pop();
        dataForCancel.push(result.sign);
       
        await reserve.cancelOrder(...dataForCancel);

        let finalAccBal = await reserveToken.balanceOf(account.address);
        let finalReserveEscrowBal = await reserveToken.balanceOf(reserveEscrow.address);
        
        let diffAccBal = finalAccBal.minus(initAccBal);
        let diffReserveEscrowBal = initReserveEscrowBal.minus(finalReserveEscrowBal);

        assert.isTrue(await reserve.cancelledOrders(orderHash), "order not cancelled");
        assert.isTrue(diffAccBal.eq(sumReserveAndProfitValue), "erc20 transfer from account failed");
        assert.isTrue(diffReserveEscrowBal.eq(sumReserveAndProfitValue), "erc20 transfer to reserve escrow failed");
    });
    
});