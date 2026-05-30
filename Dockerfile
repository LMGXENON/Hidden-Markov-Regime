FROM node:18-slim

# Install Python and pip for the yfinance fetcher
RUN apt-get update && \
    apt-get install -y python3 python3-pip build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . ./

# Install Python dependencies used by backend/fetch_yfinance.py
RUN pip3 install --no-cache-dir yfinance numpy pandas

ENV PORT=8050
EXPOSE 8050

CMD ["node", "server.js"]
