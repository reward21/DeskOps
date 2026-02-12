FROM golang:1.22-alpine AS build
WORKDIR /app
COPY apps/api/go.mod ./
RUN go mod download
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN go build -o /out/deskops-api ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/deskops-api /usr/local/bin/deskops-api
EXPOSE 9090
ENV API_PORT=9090
CMD ["/usr/local/bin/deskops-api"]
