FROM node:22-alpine

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next.js telemetry is disabled
ENV NEXT_TELEMETRY_DISABLED 1
# Next.js telemetry is disabled
ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js app
RUN npm run build

# Set the port to 3000
EXPOSE 3000

COPY entrypoint-secrets.sh /entrypoint-secrets.sh
RUN chmod +x /entrypoint-secrets.sh

# Start the application
ENTRYPOINT ["/entrypoint-secrets.sh"]
CMD ["npm", "start"]

# Build the Next.js app
RUN npm run build

=======
RUN npm run build

# Set the port to 3000
EXPOSE 3000

COPY entrypoint-secrets.sh /entrypoint-secrets.sh
RUN chmod +x /entrypoint-secrets.sh

# Start the application
ENTRYPOINT ["/entrypoint-secrets.sh"]
CMD ["npm", "start"]
