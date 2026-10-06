FROM node:22-alpine

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

<<<<<<< HEAD
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
=======
ARG VITE_DOMAIN
ARG VITE_IAM_URL
ENV VITE_DOMAIN=$VITE_DOMAIN
ENV VITE_IAM_URL=$VITE_IAM_URL

RUN npm run build

# 2. Serve Stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
>>>>>>> 3ac533c6a7611a331e0e37762f29688ddcb217aa
