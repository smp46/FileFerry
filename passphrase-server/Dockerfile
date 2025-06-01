FROM alpine:latest

WORKDIR /usr/src/app

COPY ./passphrase-server .

EXPOSE 8080

ARG USER=default
ENV HOME /home/$USER

# install sudo as root
RUN apk add --update sudo

# add new user
RUN adduser -D $USER \
&& echo "$USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$USER \
&& chmod 0440 /etc/sudoers.d/$USER

USER $USER

CMD ["./passphrase-server"]
