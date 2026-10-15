FROM node:24-bookworm-slim
WORKDIR /workspace
COPY shared/ ./shared/
RUN npm ci --prefix shared
COPY backend/ ./backend/
RUN npm ci --prefix backend
RUN npm run build --prefix backend
WORKDIR /workspace/backend
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh","-c","npm run migrate && npm start"]
