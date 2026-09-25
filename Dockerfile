# 1. Build Stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

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
