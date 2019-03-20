const helpers = require("./helpers.js");

const Kernel = artifacts.require("Kernel.sol");
const MockAccountFactory = artifacts.require("MockAccountFactory.sol");
const MockConfig = artifacts.require("MockConfig.sol");
const MockAccount = artifacts.require("MockAccount.sol");
const MockExchangeConnector = artifacts.require("MockExchangeConnector.sol");
const MockEscrowReserve = artifacts.require("MockEscrow.sol");
const MockEscrowKernel = artifacts.require("MockEscrow.sol");
const MockReserve = artifacts.require("MockReserve.sol");
const OMG = artifacts.require("TestToken.sol");
const BAT = artifacts.require("TestToken.sol");

const signTypeMeta = {
    createOrder : ["address","address","address","address","uint256","uint256","uint256","uint256","uint256","uint256"],
    repay : ["address", "bytes32", "uint256"]
};

contract("Kernel", (accounts) => {

    const acc0 = accounts[0]; // relayer
    const acc1 = accounts[1]; // user

    let config;
    let accountFactory;
    let exchangeConnector;
    let kernelEscrow;
    let reserveEscrow;
    let omg;
    let bat;
    let reserve;
    let kernel;

    before( async () => {
        config = await MockConfig.new();
        accountFactory = await MockAccountFactory.new();
        exchangeConnector = await MockExchangeConnector.new();
        kernelEscrow = await MockEscrowKernel.new();
        reserveEscrow = await MockEscrowReserve.new();
        reserve = await MockReserve.new(reserveEscrow.address, accountFactory.address);
        kernel = await Kernel.new(kernelEscrow.address, accountFactory.address, reserve.address, acc0, config.address, exchangeConnector.address);
        account = await MockAccount.new();
    });
    
    beforeEach(async () => {
        omg = await OMG.new();
        bat = await BAT.new();
    });

    it("should create loan order and transfer tokens accordingly", async() => {
        let loanValue = web3.toWei(1, "ether"); // omg
        let collValue = web3.toWei(1.5, "ether"); // bat

        await omg.transfer(reserveEscrow.address, loanValue);
        await bat.transfer(account.address, collValue);

        let initAccLoanBal = await omg.balanceOf(account.address);
        let initKernelEscrowCollBal = await bat.balanceOf(kernelEscrow.address);

        let premium = web3.toWei(0.08, "ether"); // 8%
        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;

        // account, wallet, loan, coll
        let orderAddr = [account.address, acc1, omg.address, bat.address];
        // loanValue, collValue, premium, duration, salt, fee
        let orderValues = [loanValue, collValue, premium, duration, salt, fee];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // kernel, account, wallet, loan, coll, loanValue, collValue, premium, duration, salt, fee
        let dataToSign = [kernel.address, account.address, omg.address, bat.address, loanValue, collValue, premium, duration, salt, fee];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(result.sign);

        await kernel.createOrder(...dataForCall);

        let finalAccLoanBal = await omg.balanceOf(account.address);
        let finalKernelEscrowCollBal = await bat.balanceOf(kernelEscrow.address);
        
        let diffAccLoanBal = finalAccLoanBal.minus(initAccLoanBal);
        let diffKernelEscrowCollBal = finalKernelEscrowCollBal.minus(initKernelEscrowCollBal);

        assert.isTrue(await kernel.isOrder(result.hash), "order not available");
        assert.isTrue(diffAccLoanBal.eq(loanValue), "loan erc20 transfer to account failed");
        assert.isTrue(diffKernelEscrowCollBal.eq(collValue), "coll erc20 transfer to kernel escrow failed");
    });
    
    it("should create loan order and repay", async() => {
        let loanValue = web3.toWei(1, "ether"); // omg
        let collValue = web3.toWei(1.5, "ether"); // bat

        let precision = web3.toWei(1, "ether"); // represents 100%

        await omg.transfer(reserveEscrow.address, loanValue);
        await bat.transfer(account.address, collValue);

        let premium = web3.toWei(0.08, "ether"); // 8%
        let duration = 86400; // 1 day
        let salt = helpers.generateRandomNumber();
        let fee = 0;

        // account, wallet, loan, coll
        let orderAddr = [account.address, acc1, omg.address, bat.address];
        // loanValue, collValue, premium, duration, salt, fee
        let orderValues = [loanValue, collValue, premium, duration, salt, fee];

        let dataForCall = [
            orderAddr,
            orderValues
        ];

        // kernel, account, loan, coll, loanValue, collValue, premium, duration, salt, fee
        let dataToSign = [kernel.address, account.address, omg.address, bat.address, loanValue, collValue, premium, duration, salt, fee];
        let result = await helpers.generateAndSignHash(acc1, signTypeMeta["createOrder"], dataToSign);

        dataForCall.push(result.sign);

        await kernel.createOrder(...dataForCall);
        let orderHash = result.hash;

        assert.isFalse(await kernel.isRepaid(orderHash), "order already repaid");
        
        let preQuotient = web3.toBigNumber(loanValue).times(premium);
        let premiumValue = preQuotient.div(precision);
        let valueToRepay = web3.toBigNumber(loanValue).plus(premiumValue);

        let dataForRepay = [kernel.address, orderHash, valueToRepay.toString()];
        result = await helpers.generateAndSignHash(acc1, signTypeMeta["repay"], dataForRepay);

        dataForRepay.shift();
        dataForRepay.push(result.sign);

        // transferring premium to account
        await omg.transfer(account.address, premiumValue);

        let initReserveEscrowLoanBal = await omg.balanceOf(reserveEscrow.address);
        let initAccountCollBal = await bat.balanceOf(account.address);

        await kernel.repay(...dataForRepay);

        let finalReserveEscrowLoanBal = await omg.balanceOf(reserveEscrow.address);
        let finalAccountCollBal = await bat.balanceOf(account.address);

        let diffReserveEscrowLoanBal = finalReserveEscrowLoanBal.minus(initReserveEscrowLoanBal);
        let diffAccCollBal = finalAccountCollBal.minus(initAccountCollBal);
        
        assert.isTrue(await kernel.isRepaid(orderHash), "order not repaid");
        assert.isTrue(diffAccCollBal.eq(collValue), "coll erc20 transfer to account failed");
        assert.isTrue(diffReserveEscrowLoanBal.eq(valueToRepay), "loan erc20 transfer to reserve escrow failed");
    });

});