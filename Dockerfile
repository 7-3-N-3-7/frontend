FROM node:22-alpine

WORKDIR /app

# Install Chromium and Noto fonts for headless Playwright BDD & visual baseline execution
RUN apk add --no-cache chromium font-noto font-noto-emoji
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
COPY apps/landing/package.json ./apps/landing/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
RUN npm ci

COPY . .
COPY --from=specs . /specs

# Next.js telemetry is disabled
ENV NEXT_TELEMETRY_DISABLED=1

# 1. Run Vitest unit tests with 98% coverage gate and publish HTML report to public/frontend-coverage/
# 2. Build the Next.js app (so self-contained UI Playwright BDD runs against the compiled production build)
# 3. Run unified self-contained Cucumber BDD suite (API + UI + Visual Regression) and publish report to public/frontend-cucumber/
RUN npm run test:coverage && \
    mkdir -p public/frontend-coverage public/frontend-cucumber && \
    cp -r coverage/* public/frontend-coverage/ && \
    touch public/frontend-cucumber/index.html public/frontend-cucumber/cucumber-report.html

RUN npm run build

RUN BDD_SELF_CONTAINED=true npm run test:bdd && \
    cp reports/cucumber-report.html public/frontend-cucumber/index.html && \
    cp reports/cucumber-report.html public/frontend-cucumber/cucumber-report.html

# Set the port to 3000
EXPOSE 3000

COPY entrypoint-secrets.sh /entrypoint-secrets.sh
RUN chmod +x /entrypoint-secrets.sh

# Start the application
ENTRYPOINT ["/entrypoint-secrets.sh"]
CMD ["npm", "start"]
