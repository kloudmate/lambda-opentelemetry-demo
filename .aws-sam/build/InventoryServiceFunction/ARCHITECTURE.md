# Architecture Details

## Service Flow

### 1. Successful Order Flow

```
Client
  │
  │ POST /order
  ├─────────────────────────────────────────┐
  │                                         │
  ▼                                         │
Order Service                               │
  │                                         │
  │ 1. Validate request                     │
  │ 2. Create root span                     │
  │                                         │
  │ POST /inventory (with trace context)    │
  ├─────────────────────────────┐           │
  │                             │           │
  ▼                             │           │
Inventory Service               │           │
  │                             │           │
  │ 1. Extract trace context    │           │
  │ 2. Create child span        │           │
  │ 3. Check stock levels       │           │
  │ 4. Return availability      │           │
  │                             │           │
  └─────────────────────────────┤           │
  │ Response: available=true    │           │
  ▼                             │           │
Order Service                   │           │
  │                             │           │
  │ POST /payment (with trace context)      │
  ├─────────────────────────────┐           │
  │                             │           │
  ▼                             │           │
Payment Service                 │           │
  │                             │           │
  │ 1. Extract trace context    │           │
  │ 2. Create child span        │           │
  │ 3. Process payment          │           │
  │ 4. Return result            │           │
  │                             │           │
  └─────────────────────────────┤           │
  │ Response: success=true      │           │
  ▼                             │           │
Order Service                   │           │
  │                             │           │
  │ Complete order processing   │           │
  │                             │           │
  └─────────────────────────────┤           │
  │ Response: 200 OK            │           │
  ▼                             │           │
Client ◄──────────────────────────────────────┘
```

### 2. Out of Stock Flow

```
Client → Order Service → Inventory Service
                         (Out of stock detected)
                       ← 
         Order Service 
         (Skip payment, return 409)
       ←
Client
```

### 3. Payment Failure Flow

```
Client → Order Service → Inventory Service
                         (Items available)
                       ← 
         Order Service → Payment Service
                         (Payment failed)
                       ←
         Order Service
         (Return 402)
       ←
Client
```

## Trace Structure

### Trace Hierarchy

```
Trace ID: 00000000000000000000000000000001
│
└─ Span: process-order (Order Service)
   │ Duration: 245ms
   │ Attributes:
   │   - order.id: ORD-001
   │   - customer.id: CUST-123
   │   - order.items.count: 2
   │
   ├─ Span: check-inventory (Order Service)
   │  │ Duration: 15ms
   │  │ Attributes:
   │  │   - service: inventory
   │  │   - order.id: ORD-001
   │  │
   │  └─ Span: HTTP POST (Auto-instrumented)
   │     │ Duration: 12ms
   │     │
   │     └─ Span: check-inventory (Inventory Service)
   │        Duration: 8ms
   │        Attributes:
   │          - inventory.available: true
   │          - inventory.items.count: 2
   │
   └─ Span: process-payment (Order Service)
      │ Duration: 180ms
      │ Attributes:
      │   - service: payment
      │   - order.id: ORD-001
      │   - payment.method: credit-card-5555
      │   - payment.amount: 1059.97
      │
      └─ Span: HTTP POST (Auto-instrumented)
         │ Duration: 175ms
         │
         └─ Span: process-payment (Payment Service)
            Duration: 170ms
            Attributes:
              - payment.success: true
              - payment.transaction_id: txn-1234567890-abc123
```

## OpenTelemetry Components

### 1. Tracer Provider

Manages the lifecycle of tracers and span processors.

```javascript
const provider = new NodeTracerProvider({
  resource: resource,
});
```

### 2. OTLP Exporter

Exports spans to OpenTelemetry Collector using HTTP.

```javascript
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});
```

### 3. Batch Span Processor

Batches spans before export for efficiency.

```javascript
provider.addSpanProcessor(new BatchSpanProcessor(exporter));
```

### 4. Auto Instrumentations

Automatically instruments common libraries.

```javascript
registerInstrumentations({
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-https': { enabled: true },
    }),
  ],
});
```

## Trace Context Propagation

### W3C Trace Context Format

```
traceparent: 00-<trace-id>-<span-id>-<trace-flags>

Example:
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
            │  │                                │                │
            │  └─ Trace ID (32 hex chars)      │                └─ Flags
            │                                   └─ Parent Span ID (16 hex chars)
            └─ Version (00)
```

### Context Injection

When Order Service calls Inventory Service:

```javascript
// Order Service
const headers = injectTraceContext();
// headers = { traceparent: '00-...-...-01' }

axios.post(inventoryUrl, data, { headers });
```

### Context Extraction

When Inventory Service receives request:

```javascript
// Inventory Service
const traceContext = extractTraceContext(event);
// Continue the trace with the same trace ID
```

## Span Attributes

### Semantic Conventions

Following OpenTelemetry semantic conventions:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `service.name` | Service identifier | `order-service` |
| `service.version` | Service version | `1.0.0` |
| `deployment.environment` | Environment | `production` |
| `order.id` | Order identifier | `ORD-001` |
| `customer.id` | Customer identifier | `CUST-123` |
| `payment.amount` | Payment amount | `1059.97` |
| `payment.method` | Payment method | `credit-card-5555` |
| `inventory.available` | Availability flag | `true` |
| `http.method` | HTTP method | `POST` |
| `http.status_code` | HTTP status | `200` |

## Error Handling

### Error Span Status

```javascript
span.setStatus({
  code: api.SpanStatusCode.ERROR,
  message: error.message,
});
span.recordException(error);
```

### Business Logic Errors vs Technical Errors

- **Business Logic Errors** (out of stock, payment declined):
  - Span status: OK
  - Custom attributes indicate business failure
  - Example: `inventory.available: false`

- **Technical Errors** (network failure, invalid input):
  - Span status: ERROR
  - Exception recorded
  - Stack trace captured

## Performance Considerations

### Batch Processing

Spans are batched before export to reduce network overhead:

```javascript
new BatchSpanProcessor(exporter, {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 5000,
})
```

### Sampling

For high-volume systems, implement sampling:

```javascript
const sampler = new TraceIdRatioBasedSampler(0.1); // 10% sampling
const provider = new NodeTracerProvider({
  resource: resource,
  sampler: sampler,
});
```

### Async Export

Span export is asynchronous and doesn't block Lambda execution.

## Security

### Securing OTLP Endpoint

```javascript
const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  headers: {
    'Authorization': `Bearer ${process.env.OTEL_API_KEY}`,
  },
});
```

### Data Privacy

- Avoid capturing sensitive data in spans
- Redact PII from span attributes
- Use attribute filtering in the collector

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Trace Completeness**
   - Percentage of complete traces
   - Missing spans

2. **Error Rates**
   - Spans with ERROR status
   - Service-specific error rates

3. **Latency**
   - P50, P95, P99 latencies
   - Per-service latency breakdown

4. **Business Metrics**
   - Order success rate
   - Payment failure rate
   - Inventory unavailability rate

### Example Queries (Jaeger)

```
# Find all failed orders
service="order-service" AND error=true

# Find orders with payment failures
service="payment-service" AND payment.success=false

# Find slow orders (> 1s)
service="order-service" AND duration>1000ms

# Find out-of-stock scenarios
service="inventory-service" AND inventory.available=false
```

## Troubleshooting

### Common Issues

1. **Traces not appearing**
   - Check OTLP endpoint connectivity
   - Verify Lambda has network access
   - Check CloudWatch logs for export errors

2. **Broken traces**
   - Verify trace context propagation
   - Check HTTP header forwarding
   - Ensure consistent trace ID format

3. **High latency**
   - Review span processor configuration
   - Check collector performance
   - Consider async export optimization

4. **Missing spans**
   - Verify auto-instrumentation is active
   - Check for exceptions during span creation
   - Review sampling configuration
