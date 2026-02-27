#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Lambda OpenTelemetry Demo - Test Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if API endpoint is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: API endpoint is required${NC}"
    echo "Usage: ./test-api.sh <API_ENDPOINT>"
    echo "Example: ./test-api.sh https://abc123.execute-api.us-east-1.amazonaws.com/Prod"
    exit 1
fi

API_ENDPOINT=$1
ORDER_URL="${API_ENDPOINT}/order"

echo -e "${YELLOW}Using API Endpoint: ${API_ENDPOINT}${NC}"
echo ""

# Test 1: Successful Order
echo -e "${BLUE}Test 1: Successful Order${NC}"
echo "Testing with items that are in stock and valid payment method..."
curl -X POST ${ORDER_URL} \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-001",
    "customerId": "CUST-123",
    "paymentMethod": "credit-card-5555",
    "items": [
      {
        "itemId": "item-001",
        "name": "Laptop",
        "quantity": 1,
        "price": 999.99
      },
      {
        "itemId": "item-002",
        "name": "Mouse",
        "quantity": 2,
        "price": 29.99
      }
    ]
  }'
echo -e "\n"

sleep 2

# Test 2: Out of Stock Order
echo -e "${BLUE}Test 2: Out of Stock Order${NC}"
echo "Testing with items that are out of stock..."
curl -X POST ${ORDER_URL} \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-002",
    "customerId": "CUST-456",
    "paymentMethod": "credit-card-5555",
    "items": [
      {
        "itemId": "item-003",
        "name": "Keyboard",
        "quantity": 1,
        "price": 79.99
      },
      {
        "itemId": "item-005",
        "name": "Headphones",
        "quantity": 1,
        "price": 149.99
      }
    ]
  }'
echo -e "\n"

sleep 2

# Test 3: Payment Failure (Card Declined)
echo -e "${BLUE}Test 3: Payment Failure - Card Declined${NC}"
echo "Testing with a payment method that will be declined..."
curl -X POST ${ORDER_URL} \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-003",
    "customerId": "CUST-789",
    "paymentMethod": "4111111111111111",
    "items": [
      {
        "itemId": "item-001",
        "name": "Laptop",
        "quantity": 1,
        "price": 999.99
      }
    ]
  }'
echo -e "\n"

sleep 2

# Test 4: Payment Failure (Insufficient Funds)
echo -e "${BLUE}Test 4: Payment Failure - Insufficient Funds${NC}"
echo "Testing with insufficient funds scenario..."
curl -X POST ${ORDER_URL} \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORD-004",
    "customerId": "CUST-999",
    "paymentMethod": "4222222222222222",
    "items": [
      {
        "itemId": "item-004",
        "name": "Monitor",
        "quantity": 2,
        "price": 399.99
      }
    ]
  }'
echo -e "\n"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All tests completed!${NC}"
echo -e "${GREEN}Check your OpenTelemetry backend to view the traces${NC}"
echo -e "${GREEN}========================================${NC}"
