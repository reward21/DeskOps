FROM node:20-alpine
WORKDIR /app
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/package-lock.json ./apps/web/package-lock.json
WORKDIR /app/apps/web
RUN npm install
COPY apps/web ./
EXPOSE 8888
ENV WEB_PORT=8888
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8888"]
