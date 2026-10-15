FROM node:24-bookworm-slim AS build
WORKDIR /workspace
COPY shared/ ./shared/
RUN npm ci --prefix shared
COPY frontend/ ./frontend/
RUN npm ci --prefix frontend && npm run build --prefix frontend
COPY backend/ ./backend/
RUN npm ci --prefix backend && npm run build --prefix backend

FROM node:24-bookworm-slim
WORKDIR /workspace
COPY --from=build /workspace/shared ./shared
COPY --from=build /workspace/backend ./backend
COPY --from=build /workspace/frontend/dist ./frontend/dist
WORKDIR /workspace/backend
ENV NODE_ENV=production
ENV STATIC_DIR=/workspace/frontend/dist
EXPOSE 10000
CMD ["sh","-c","npm run migrate && npm run catalog:release && npm start"]
