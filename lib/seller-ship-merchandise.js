/* global getCurrentParticipant getAssetRegistry getFactory emit */


/**
 * Get namespace
 * @returns {string}
 */
function getNamespace() {
    return 'org.finance.payment';
}

/**
 * Get namespace for composer type
 * @param {string} type - hyperledger composer model type
 * @returns {string} namespace
 */
function getNamespaceForType(type) {
    return `${getNamespace()}.${type}`;
}

/**
 * Ship trade merchandise
 * @param {org.finance.payment.ShipMerchandise} shipping - the shipping to be processed
 * @transaction
 */
async function shipMerchandise(shipping) { // eslint-disable-line no-unused-vars
    const tradeRegistry = await getAssetRegistry(getNamespaceForType('Trade'));
    const currentParticipant = getCurrentParticipant();

    if (shipping.trade.seller.id !== currentParticipant.id) {
        throw new Error('the trader is not the seller of this trade');
    }

    if (shipping.trade.status !== 'STEP_3_BUYER_MOVED_FUNDS_TO_ESCROW') {
        throw new Error('the trade is not ready yet or also has been shipped');
    }

    shipping.trade.status = 'STEP_4_MERCHANDISE_IS_SHIPPED';

    await tradeRegistry.update(shipping.trade);

    // emit event
    const factory = getFactory();
    let event = factory.newEvent('org.finance.payment', 'MerchandiseIsShippedEvent');
    event.trade = shipping.trade;
    emit(event);
}