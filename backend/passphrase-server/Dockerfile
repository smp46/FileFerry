FROM golang:1.24-alpine AS builder

WORKDIR /build

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o passphrase-server .

FROM alpine:latest

WORKDIR /usr/src/app

COPY --from=builder /build/passphrase-server .

RUN chmod +x ./passphrase-server

EXPOSE 8080

ARG APP_USER_NAME=dbuser
ENV APP_USER_HOME /home/$APP_USER_NAME

RUN adduser -D -h $APP_USER_HOME $APP_USER_NAME
RUN chown -R $APP_USER_NAME:$APP_USER_NAME /usr/src/app

USER $APP_USER_NAME

ENV SERVER_PORT="8080"

CMD ["./passphrase-server"]
