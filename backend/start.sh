#!/bin/bash
set -e

echo "Starting Charge API..."

# Wait for database to be ready
echo "Waiting for database connection..."
python -c "
import time
import os
from sqlalchemy import create_engine
from app.core.config import settings

max_retries = 30
for i in range(max_retries):
    try:
        engine = create_engine(settings.DATABASE_URI)
        engine.connect()
        print('Database connection successful')
        break
    except Exception as e:
        if i == max_retries - 1:
            print(f'Failed to connect to database after {max_retries} attempts')
            raise e
        print(f'Database connection attempt {i+1} failed, retrying...')
        time.sleep(2)
"

# Run database migrations
echo "Running database migrations..."
alembic upgrade head

# Start the FastAPI server
echo "Starting FastAPI server..."
PORT=${PORT:-8000}
if [ "${ENV:-development}" = "production" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --access-log
else
    exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --reload
fi
