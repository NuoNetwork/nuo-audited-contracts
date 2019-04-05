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

    it("should cancel reserve order by using process", async() => {
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

        await helpers.increaseGanacheBlockTime(2 * 86400); // 1 days

        await reserve.processOrder(orderHash);

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
        await reserve.updateReserveValues(reserveToken.address, 7);
        await reserve.updateOrderCumulativeValue(orderHash, 2);

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

    it("should distribute profits to order by cumulative batch update", async() => {
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
        await reserve.updateReserveValues(reserveToken.address, 15);
        await reserve.updateOrderCumulativeValueBatch([orderHash], [3]);

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

    it("should distribute losses to order", async() => {
        let reserveValue = web3.toWei(1, "ether"); 
        let lossValue = web3.toWei(0.8, "ether");
        let repaidValue = web3.toWei(0.2, "ether");
        
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
        
        // loan repaid with loss
        await reserve.lock(reserveToken.address, account.address, repaidValue, 0, lossValue);
        await helpers.increaseGanacheBlockTime(1 * 86400); // 1 days

        // reserve values and order calculations
        await reserve.updateReserveValues(reserveToken.address, 15);
        await reserve.updateOrderCumulativeValue(orderHash, 3);

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
        assert.isTrue(diffAccBal.eq(repaidValue), "erc20 transfer from account failed");
        assert.isTrue(diffReserveEscrowBal.eq(repaidValue), "erc20 transfer to reserve escrow failed");
    });


    it("should not create reserve order and get error for invalid signer", async() => {
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

        // invalidating sign 
        result.sign = result.sign.replace("e", "c");

        dataForCall.push(result.sign);

        let tx = await reserve.createOrder(...dataForCall);

        assert.isFalse(await reserve.isOrder(result.hash), "order not available");
        assert.isTrue(tx.logs[0].event == "LogErrorWithHintBytes32", "event not found");
        assert.isTrue(tx.logs[0].args.bytes32Value == result.hash, "invalid order hash");
        assert.isTrue(tx.logs[0].args.methodSig == "Reserve::createOrder", "invalid methodsig");
        assert.isTrue(tx.logs[0].args.errMsg == "SIGNER_NOT_ORDER_CREATOR", "invalid err msg"); 
    });
});