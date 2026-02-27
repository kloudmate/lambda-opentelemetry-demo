const { withSpan, addSpanAttributes } = require('../shared/tracer');
const { createResponse } = require('../shared/utils');

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
 * OpenTelemetry instrumentation is automatically provided by the Lambda Layer
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
        addSpanAttributes({
          'error': true,
          'error.message': 'Missing or invalid required fields',
        });
        return createResponse(400, {
          available: false,
          error: 'Missing or invalid required fields: orderId, items (array)',
        });
      }

      addSpanAttributes({
        'order.id': orderId,
        'inventory.items.count': items.length,
      });

      console.log(`Checking inventory for order ${orderId}`);

      // Check each item
      const unavailableItems = [];
      let allAvailable = true;

      for (const item of items) {
        const { itemId, quantity } = item;
        
        if (!itemId || !quantity) {
          continue;
        }

        addSpanAttributes({
          [`inventory.item.${itemId}.requested`]: quantity,
        });

        // Check if item exists in inventory
        if (!inventory[itemId]) {
          console.log(`Item ${itemId} not found in inventory`);
          unavailableItems.push({
            itemId,
            reason: 'Item not found',
          });
          allAvailable = false;
          addSpanAttributes({
            [`inventory.item.${itemId}.status`]: 'not-found',
          });
          continue;
        }

        const availableQuantity = inventory[itemId].quantity;
        addSpanAttributes({
          [`inventory.item.${itemId}.available`]: availableQuantity,
        });

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
          addSpanAttributes({
            [`inventory.item.${itemId}.status`]: 'insufficient',
          });
        } else {
          console.log(`Item ${itemId} is available. Requested: ${quantity}, Available: ${availableQuantity}`);
          addSpanAttributes({
            [`inventory.item.${itemId}.status`]: 'available',
          });
        }
      }

      addSpanAttributes({
        'inventory.all_available': allAvailable,
        'inventory.unavailable_count': unavailableItems.length,
      });

      if (allAvailable) {
        console.log(`All items available for order ${orderId}`);
        
        return createResponse(200, {
          available: true,
          orderId,
          message: 'All items are available',
        });
      } else {
        console.log(`Some items unavailable for order ${orderId}:`, unavailableItems);
        addSpanAttributes({
          'inventory.failure_reason': 'items-unavailable',
        });
        
        return createResponse(200, {
          available: false,
          orderId,
          unavailableItems,
          message: 'Some items are not available',
        });
      }

    } catch (error) {
      console.error('Inventory check error:', error);
      addSpanAttributes({
        'error': true,
        'error.message': error.message,
      });
      
      return createResponse(500, {
        available: false,
        error: 'Internal server error',
        details: error.message,
      });
    }
  });
};
