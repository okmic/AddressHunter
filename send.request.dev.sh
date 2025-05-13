curl -X POST "http://localhost:8000/compare" \
-H "Content-Type: application/json" \
-d '{"address1": "г. Москва, ул. Ленина, д. 10", "address2": "Москва, улица Ленина, дом 10"}'


curl -X POST "http://localhost:8000/compare" \
-H "Content-Type: application/json" \
-d '{"address1": "г. Москва, ул. Ленина, д. 10", "address2": "Москва, улица Ленина, 10"}'


curl -X POST "http://localhost:8000/compare" \
-H "Content-Type: application/json" \
-d '{"address1": "г. Москва, ул. Ленина, д. 10", "address2": "Москва, улица Ленина 101"}'