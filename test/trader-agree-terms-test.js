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


describe('Trader agrees to terms', () => {
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

    it('the trader is not part of the trade', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);

        // create trade
        let buyer = Util.getTrader(1);
        let seller = Util.getTrader(2);
        const trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // Agree transaction
        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, buyer.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = true;
        await businessNetworkConnection.submitTransaction(agreement).should.be.rejectedWith(Error);
    });

    it('the buyer does not accept the terms', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);

        // create trade
        let buyer = Util.getTrader(0);
        let seller = Util.getTrader(1);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // Agree transaction
        const agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, buyer.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = false;
        await businessNetworkConnection.submitTransaction(agreement);

        // check the status of the trade
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_2_TERMS_NOT_ACCEPTED');
        trade.cancelledBy.$identifier.should.equal(buyer.id);
    });

    it('the buyer does not accept the terms', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        // create trade
        let buyer = Util.getTrader(0);
        let seller = Util.getTrader(1);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // Agree transaction
        const agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, buyer.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = false;
        await businessNetworkConnection.submitTransaction(agreement);

        // check the status of the trade
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_2_TERMS_NOT_ACCEPTED');
        trade.cancelledBy.$identifier.should.equal(seller.id);
    });

    it('buyer and seller accept the terms', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);

        // create trade
        let buyer = Util.getTrader(0);
        let seller = Util.getTrader(1);
        let trade = ModelFactory.createTrade(factory, '1', buyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);
        await tradeRegistry.add(trade);

        // Buyer agrees to terms
        let agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, buyer.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = true;
        await businessNetworkConnection.submitTransaction(agreement);

        // check the status of the trade after buyer accepts
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        trade.hasBuyerAcceptedTerms.should.equal(true);
        trade.hasSellerAcceptedTerms.should.equal(false);

        // Seller agrees to terms
        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, seller.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = true;
        await businessNetworkConnection.submitTransaction(agreement);

        // check the status of the trade after seller accepts
        // check the status of the trade after buyer accepts
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_2_TERMS_ACCEPTED');
        trade.hasBuyerAcceptedTerms.should.equal(true);
        trade.hasSellerAcceptedTerms.should.equal(true);
    });

    it('buyer and seller accept the terms for auto pay trade', async () => {
        const factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        // make sure the buyer has enough funds
        businessNetworkConnection = await Util.connectAsAdmin(businessNetworkConnection, adminCardName);
        const traderRegistry = await Util.getTraderRegistry(businessNetworkConnection);
        let startBuyer = Util.getTrader(0);
        let buyer = await traderRegistry.get(startBuyer.id);
        buyer.balance = 50000;
        await traderRegistry.update(buyer);

        businessNetworkConnection = await Util.connectAsTrader(0, businessNetworkConnection);
        const tradeRegistry = await Util.getTradeRegistry(businessNetworkConnection);

        // create trade
        let seller = Util.getTrader(1);
        let trade = ModelFactory.createTrade(factory, '1', startBuyer.id, seller.id, true, 'STEP_1_WAITING_FOR_TERMS_AGREEMENT', true);
        await tradeRegistry.add(trade);


        // Buyer agrees to terms
        let agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, startBuyer.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = true;
        await businessNetworkConnection.submitTransaction(agreement);

        // check the status of the trade after buyer accepts
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_1_WAITING_FOR_TERMS_AGREEMENT');
        trade.hasBuyerAcceptedTerms.should.equal(true);
        trade.hasSellerAcceptedTerms.should.equal(false);

        // Seller agrees to terms
        businessNetworkConnection = await Util.connectAsTrader(1, businessNetworkConnection);

        agreement = ModelFactory.createTransaction(factory, ModelFactory.TYPE.AGREE_TERMS);
        agreement.trader = ModelFactory.createRelationshipForTrader(factory, seller.id);
        agreement.trade = ModelFactory.createRelationshipForTrade(factory, trade.id);
        agreement.isAccepted = true;
        await businessNetworkConnection.submitTransaction(agreement);


        // check the escrowAccounts and balance
        const accountRegistry = await Util.getEscrowAccountRegistry(businessNetworkConnection);
        const accounts = await accountRegistry.getAll();
        accounts.length.should.equal(1);
        accounts[0].balance.should.equal(trade.total);

        // check the status of the trade
        trade = await tradeRegistry.get(trade.id);
        trade.status.should.equal('STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW');
        trade.hasBuyerAcceptedTerms.should.equal(true);
        trade.hasSellerAcceptedTerms.should.equal(true);

        //check buyer balance
        buyer = await traderRegistry.get(buyer.id);
        buyer.balance.should.equal(50000 - trade.total);
    });
});
