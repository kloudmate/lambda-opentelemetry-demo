const axios = require('axios');
const { injectTraceContext } = require('./tracer');

/**
 * Make an HTTP request to another Lambda service with trace context propagation
 * @param {string} url - Service URL
 * @param {Object} data - Request payload
 * @param {string} method - HTTP method (default: POST)
 * @returns {Promise<Object>} Response data
 */
async function callService(url, data, method = 'POST') {
  // Inject trace context into headers
  const headers = {
    'Content-Type': 'application/json',
    ...injectTraceContext(),
  };

  console.log(`Calling service: ${url} with method: ${method}`);
  console.log(`Trace context headers:`, headers);

  try {
    const response = await axios({
      method,
      url,
      data,
      headers,
    });

    console.log(`Service call successful: ${url}`);
    return response.data;
  } catch (error) {
    console.error(`Service call failed: ${url}`, error.message);
    if (error.response) {
      throw new Error(`Service call failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Create a Lambda response object
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @param {Object} headers - Additional headers
 * @returns {Object} Lambda response object
 */
function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

module.exports = {
  callService,
  createResponse,
};
