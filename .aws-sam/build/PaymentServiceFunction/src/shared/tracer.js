// When using OpenTelemetry Lambda Layer with auto-instrumentation,
// the @opentelemetry/api is provided by the layer at /opt/nodejs/node_modules
const api = require('@opentelemetry/api');

/**
 * Get the current active span
 * The Lambda Layer automatically creates spans for Lambda invocations
 * @returns {Span} Current active span
 */
function getCurrentSpan() {
  return api.trace.getActiveSpan();
}

/**
 * Get a tracer instance
 * @param {string} name - Tracer name (usually service name)
 * @param {string} version - Service version
 * @returns {Tracer} OpenTelemetry tracer instance
 */
function getTracer(name = 'lambda-app', version = '1.0.0') {
  return api.trace.getTracer(name, version);
}

/**
 * Create a new span for a specific operation
 * @param {string} spanName - Name of the span
 * @param {Function} fn - Function to execute within the span
 * @param {Object} attributes - Optional span attributes
 * @returns {Promise} Result of the function execution
 */
async function withSpan(spanName, fn, attributes = {}) {
  const tracer = getTracer();
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      // Add custom attributes
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
      
      const result = await fn(span);
      span.setStatus({ code: api.SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: api.SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add custom attributes to the current span
 * @param {Object} attributes - Key-value pairs of attributes to add
 */
function addSpanAttributes(attributes) {
  const span = getCurrentSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        span.setAttribute(key, value);
      }
    });
  }
}

/**
 * Record an exception on the current span
 * @param {Error} error - Error to record
 */
function recordException(error) {
  const span = getCurrentSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({
      code: api.SpanStatusCode.ERROR,
      message: error.message,
    });
  }
}

/**
 * Inject trace context into headers for downstream service calls
 * Uses W3C Trace Context propagation
 * @returns {Object} Headers with trace context
 */
function injectTraceContext() {
  const headers = {};
  const span = getCurrentSpan();
  
  if (span) {
    const spanContext = span.spanContext();
    if (spanContext && spanContext.traceId && spanContext.spanId) {
      // W3C Trace Context format
      const traceFlags = spanContext.traceFlags || 0;
      headers.traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${traceFlags.toString(16).padStart(2, '0')}`;
      
      if (spanContext.traceState) {
        headers.tracestate = spanContext.traceState.serialize();
      }
    }
  }
  
  return headers;
}

module.exports = {
  getTracer,
  getCurrentSpan,
  withSpan,
  addSpanAttributes,
  recordException,
  injectTraceContext,
};
