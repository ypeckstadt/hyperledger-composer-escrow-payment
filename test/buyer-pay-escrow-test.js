'use strict';

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');
const ModelFactory = require('./model-factory');
const Util = require('./util');

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
chai.should();


describe('Buyer pays escrow', () => {
    // In-memory card store for testing so cards are not persisted to the file system
    let adminConnection;
    let businessNetworkConnection;
    let adminCardName;

    // Test suite initial setup
    before(async () => {
        // Embedded connection used for local testing
        const connectionProfile = {
            name: 'embedded',
            'x-type': 'embedded'
        };
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // PeerAdmin identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);

        const deployerCardName = 'PeerAdmin';
        adminConnection = new AdminConnection({ cardStore: Util.CARD_STORE });

        // TODO: Quickfix for https://github.com/hyperledger/composer/issues/3023
        if (!global.hasPeerAdminBeenAdded) {
            await adminConnection.importCard(deployerCardName, deployerCard);
            global.hasPeerAdminBeenAdded = true;
        }
       
        await adminConnection.connect(deployerCardName);
    });

    // This is called before each test is executed.
    beforeEach(async () => {
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: Util.CARD_STORE });

        const adminUserName = 'admin';
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));

        // Install the Composer runtime for the new business network
        await adminConnection.install(businessNetworkDefinition);

        // Start the business network and configure an network admin identity
        const startOptions = {
            networkAdmins: [
                {
                    userName: adminUserName,
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkDefinition.getName(), businessNetworkDefinition.getVersion(), startOptions);

        // Import the network admin identity for us to use
        adminCardName = `${adminUserName}@${businessNetworkDefinition.getName()}`;
        await adminConnection.importCard(adminCardName, adminCards.get(adminUserName));

        // Connect to the business network using the network admin identity
        await businessNetworkConnection.connect(adminCardName);

        await Util.createTestTraders(businessNetworkConnection, adminConnection);
    });

    it('the trader is the not the buyer of the trade', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_2_TERMS_ACCEPTED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // payment
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const payment = ModelFactory.createTransaction(factory, ModelFactory.TYPE.PAY_ESCROW);
        payment.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(payment).should.be.rejectedWith(Error);
    });

    it('the trade is not payable in its current status', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // payment
        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);
        const payment = ModelFactory.createTransaction(factory, ModelFactory.TYPE.PAY_ESCROW);
        payment.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(payment).should.be.rejectedWith(Error);
    });

    it('the buyer has insufficient funds', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_2_TERMS_ACCEPTED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // payment
        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);
        const payment = ModelFactory.createTransaction(factory, ModelFactory.TYPE.PAY_ESCROW);
        payment.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(payment).should.be.rejectedWith(Error);
    });

    it('the buyer pays escrow', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_2_TERMS_ACCEPTED');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // update buyer balance
        const traderRegistry = await Util.getTraderRegistry(businessNetworkConnection);
        let trader = await traderRegistry.get(buyer.id);
        trader.balance = 50000;
        await traderRegistry.update(trader);

        // payment
        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);
        const payment = ModelFactory.createTransaction(factory, ModelFactory.TYPE.PAY_ESCROW);
        payment.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        await businessNetworkConnection.submitTransaction(payment);

        // check status of the trade
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW');

        // check buyer escrow account balance
        const accounts =  await businessNetworkConnection.query('selectEscrowAccountsForTrader', { trader: `resource:org.finance.payment.Trader#${buyer.id}`});
        accounts.length.should.equal(1);
        accounts[0].balance.should.equal(trade.total);

        // check buyer balance
        trader = await traderRegistry.get(buyer.id);
        trader.balance.should.equal(50000 - trade.total);
    });
});