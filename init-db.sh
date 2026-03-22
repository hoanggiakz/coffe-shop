#!/bin/bash
set -e

# This script runs automatically via docker-entrypoint-initdb.d
# It creates separate databases for each microservice

for db in userdb tabledb orderdb chatdb inventorydb paymentdb reportdb; do
  echo "Creating database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    CREATE DATABASE "$db";
EOSQL
  echo "Database $db created successfully"
done

echo "All MVP databases created"
