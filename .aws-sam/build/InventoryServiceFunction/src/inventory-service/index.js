const { initTracer, withSpan } = require('../shared/tracer');
const { createResponse } = require('../shared/utils');
const api = require('@opentelemetry/api');

// Initialize tracer for Inventory Service
const tracer = initTracer('inventory-service');

// Mock inventory database
const inventory = {
  'item-001': { name: 'Laptop', quantity: 10 },
  'item-002': { name: 'Mouse', quantity: 50 },
  'item-003': { name: 'Keyboard', quantity: 0 },  // Out of stock
  'item-004': { name: 'Monitor', quantity: 5 },
  'item-005': { name: 'Headphones', quantity: 0 }, // Out of stock
};

/**
 * Inventory Service Lambda Handler
 * This service checks if requested items are available in inventory
 */
exports.handler = async (event) => {
  console.log('Inventory Service received event:', JSON.stringify(event));

  return withSpan('check-inventory', async (span) => {
    try {
      // Parse request body
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      const { orderId, items } = body;

      // Validate input
      if (!orderId || !items || !Array.isArray(items)) {
        span.setStatus({ code: api.SpanStatusCode.ERROR, message: 'Invalid input' });
        span.setAttribute('error', true);
        span.setAttribute('error.message', 'Missing or invalid required fields');
        return createResponse(400, {
          available: false,
          error: 'Missing or invalid required fields: orderId, items (array)',
        });
      }

      span.setAttribute('order.id', orderId);
      span.setAttribute('inventory.items.count', items.length);

      console.log(`Checking inventory for order ${orderId}`);

      // Check each item
      const unavailableItems = [];
      let allAvailable = true;

      for (const item of items) {
        const { itemId, quantity } = item;
        
        if (!itemId || !quantity) {
          continue;
        }

        span.setAttribute(`inventory.item.${itemId}.requested`, quantity);

        // Check if item exists in inventory
        if (!inventory[itemId]) {
          console.log(`Item ${itemId} not found in inventory`);
          unavailableItems.push({
            itemId,
            reason: 'Item not found',
          });
          allAvailable = false;
          span.setAttribute(`inventory.item.${itemId}.status`, 'not-found');
          continue;
        }

        const availableQuantity = inventory[itemId].quantity;
        span.setAttribute(`inventory.item.${itemId}.available`, availableQuantity);

        // Check if sufficient quantity is available
        if (availableQuantity < quantity) {
          console.log(`Insufficient quantity for item ${itemId}. Requested: ${quantity}, Available: ${availableQuantity}`);
          unavailableItems.push({
            itemId,
            name: inventory[itemId].name,
            requestedQuantity: quantity,
            availableQuantity: availableQuantity,
            reason: availableQuantity === 0 ? 'Out of stock' : 'Insufficient quantity',
          });
          allAvailable = false;
          span.setAttribute(`inventory.item.${itemId}.status`, 'insufficient');
        } else {
          console.log(`Item ${itemId} is available. Requested: ${quantity}, Available: ${availableQuantity}`);
          span.setAttribute(`inventory.item.${itemId}.status`, 'available');
        }
      }

      span.setAttribute('inventory.all_available', allAvailable);
      span.setAttribute('inventory.unavailable_count', unavailableItems.length);

      if (allAvailable) {
        console.log(`All items available for order ${orderId}`);
        span.setStatus({ code: api.SpanStatusCode.OK });
        
        return createResponse(200, {
          available: true,
          orderId,
          message: 'All items are available',
        });
      } else {
        console.log(`Some items unavailable for order ${orderId}:`, unavailableItems);
        span.setAttribute('inventory.failure_reason', 'items-unavailable');
        span.setStatus({ code: api.SpanStatusCode.OK }); // Business logic, not an error
        
        return createResponse(200, {
          available: false,
          orderId,
          unavailableItems,
          message: 'Some items are not available',
        });
      }

    } catch (error) {
      console.error('Inventory check error:', error);
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      
      return createResponse(500, {
        available: false,
        error: 'Internal server error',
        details: error.message,
      });
    }
  });
};
