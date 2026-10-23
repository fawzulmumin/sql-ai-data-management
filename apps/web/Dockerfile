# Stage 1: Build Angular application
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production --base-href /sql-ai/

# Stage 2: Serve with Nginx Alpine
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

# Clean default html
RUN rm -rf /usr/share/nginx/html/*

# Copy build artifacts to both root and /sql-ai/ subdirectory
COPY --from=build /app/dist/web/browser/ /usr/share/nginx/html/
COPY --from=build /app/dist/web/browser/ /usr/share/nginx/html/sql-ai/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
