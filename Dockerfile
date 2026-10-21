FROM node:22-alpine

WORKDIR /app

# Install Chromium for headless Playwright BDD execution during image build
RUN apk add --no-cache chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next.js telemetry is disabled
ENV NEXT_TELEMETRY_DISABLED=1

# 1. Run Vitest unit tests with 98% coverage gate and publish HTML report to public/frontend-coverage/
# 2. Run self-contained Cucumber BDD suite and publish HTML report to public/frontend-cucumber/
RUN npm run test:coverage && \
    mkdir -p public/frontend-coverage public/frontend-cucumber && \
    cp -r coverage/* public/frontend-coverage/ && \
    BDD_SELF_CONTAINED=true npm run test:bdd && \
    cp reports/cucumber-report.html public/frontend-cucumber/index.html && \
    cp reports/cucumber-report.html public/frontend-cucumber/cucumber-report.html

# Build the Next.js app (with generated reports baked into public/)
RUN npm run build

# Set the port to 3000
EXPOSE 3000

COPY entrypoint-secrets.sh /entrypoint-secrets.sh
RUN chmod +x /entrypoint-secrets.sh

# Start the application
ENTRYPOINT ["/entrypoint-secrets.sh"]
CMD ["npm", "start"]
