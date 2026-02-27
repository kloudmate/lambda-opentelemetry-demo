const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const api = require('@opentelemetry/api');

/**
 * Initialize OpenTelemetry tracing for AWS Lambda
 * This function sets up the tracer provider with OTLP exporter
 * 
 * @param {string} serviceName - Name of the service for identification in traces
 * @returns {Tracer} OpenTelemetry tracer instance
 */
function initTracer(serviceName) {
  // Create resource with service information
  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      'deployment.environment': process.env.ENVIRONMENT || 'development'
    })
  );

  // Configure OTLP exporter
  // In production, this should point to your OpenTelemetry Collector or backend
  // For demo purposes, you can use Jaeger, Zipkin, or other OTLP-compatible backend
  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    headers: {
      // Add any required headers for authentication
    },
  });

  // Create tracer provider
  const provider = new NodeTracerProvider({
    resource: resource,
  });

  // Add span processor with batch export
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  // Register the provider
  provider.register();

  // Register auto-instrumentations for common libraries
  registerInstrumentations({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-aws-lambda': {
          disableAwsContextPropagation: false,
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-https': {
          enabled: true,
        },
      }),
    ],
  });

  console.log(`OpenTelemetry tracer initialized for service: ${serviceName}`);
  
  return api.trace.getTracer(serviceName, '1.0.0');
}

/**
 * Get the current active span
 * @returns {Span} Current active span
 */
function getCurrentSpan() {
  return api.trace.getActiveSpan();
}

/**
 * Create a new span for a specific operation
 * @param {string} spanName - Name of the span
 * @param {Function} fn - Function to execute within the span
 * @returns {Promise} Result of the function execution
 */
async function withSpan(spanName, fn) {
  const tracer = api.trace.getTracer('default');
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
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
 * Extract trace context from event headers for context propagation
 * @param {Object} event - Lambda event object
 * @returns {Object} Trace context
 */
function extractTraceContext(event) {
  const headers = event.headers || {};
  
  // Extract W3C trace context headers
  return {
    traceparent: headers.traceparent || headers.Traceparent,
    tracestate: headers.tracestate || headers.Tracestate,
  };
}

/**
 * Inject trace context into headers for downstream service calls
 * @returns {Object} Headers with trace context
 */
function injectTraceContext() {
  const headers = {};
  const span = getCurrentSpan();
  
  if (span) {
    const spanContext = span.spanContext();
    if (spanContext) {
      // W3C Trace Context format
      headers.traceparent = `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags.toString(16).padStart(2, '0')}`;
    }
  }
  
  return headers;
}

module.exports = {
  initTracer,
  getCurrentSpan,
  withSpan,
  extractTraceContext,
  injectTraceContext,
};
