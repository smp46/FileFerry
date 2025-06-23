<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url] [![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]

</div>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/smp46/FileFerry">
    <img src="public/favicon/favicon-96x96.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">FileFerry</h3>

  <p align="center">
    Peer-to-peer, encrypted file sharing, without leaving your browser!
    <br />
    <a href="https://fileferry.xyz">View Live Site</a>
    &middot;
    <a href="https://github.com/smp46/FileFerry/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/smp46/FileFerry/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

<div align="center">

[![FileFerry Screenshot][product-screenshot]](https://fileferry.xyz)

</div>

FileFerry is a browser-based application for direct file transfers without the
need to store the file on a third-party server. Users share files using a simple
passphrase – the sender creates a unique phrase the receiver enters to connect.

The app utilizes js-libp2p for networking and WebRTC for transfers. Senders
register their p2p network address with a temporary passphrase through a lookup
API. Receivers use this passphrase to find and connect to senders, using a relay
server to establish the connection. Once that initial connection is made, both
parties establish a direct WebRTC connection.

When a direct connection is prevented by Network Address Translation (NAT) on
one or both ends, the app completes the transfer by using a relay server. This
server acts as a glue for the two connections, allowing two peers to
communicate, and uses only the bandwidth needed for the transfer. The entire
transfer is protected by end-to-end encryption using the Noise framework, with
x25519 key pairs for authentication and the ChaCha20Poly1305 cipher for data
encryption, ensuring your data stays private and secure.

### Built With

This project would not have been possible without the awesome contributors to
Libp2p. I hope one day I'll be able to contribute as well :)

Here is the software stack used to build FileFerry:

- [![js-libp2p][js-libp2p]][js-libp2p-url]
- [![TypeScript][TypeScript]][TypeScript-url]
- [![HTML][HTML]][HTML-url]
- [![CSS][CSS]][CSS-url]
- [![TailwindCSS][TailwindCSS]][TailwindCSS-url]
- [![Docker][Docker]][Docker-url]
- [![Go][Go]][Go-url]
- [![CoTURN][CoTURN]][CoTURN-url]

<!-- GETTING STARTED -->

## Getting Started

The recommended way to use FileFerry is via the
[Github Pages](https://fileferry.xyz) hosted version, it is deployed straight
from the `gh-pages` branch right here in the repo.

Otherwise, follow these steps to get FileFerry running locally. I run the
backend externally (on a seperate remote machine) to the front-end, your mileage
may vary as to how well this would or wouldn't work on a single host.

**This section requires updating regarding what needs to be changed to get this
running under a different domain (that isn't fileferry.xyz), stay tuned for
that.**

### Prerequisites

Here is what you need to build and run your own instance of FileFerry:

- [Node.js](https://nodejs.org/en/download/) and
  [npm](https://www.npmjs.com/get-npm)
- [Docker](https://docs.docker.com/get-docker/) and
  [Docker Compose](https://docs.docker.com/compose/install/)

### Installation

1. **Clone the repository:**

   ```
   git clone https://github.com/smp46/FileFerry.git
   cd FileFerry
   ```

2. **Install Frontend Dependencies:** Navigate to the root of the cloned
   repository and install the Node.js packages for the frontend:

   ```
   npm install
   ```

3. **Build Backend Docker Images:** The `passphrase-server` (Go) and
   `relay-server` (Node.js) are built as Docker images. You need to build them
   from their respective directories.

   ```
   docker build -t passphrase-server ./backend/passphrase-server
   ```

   ```
   docker build -t relay-server ./backend/relay-server
   ```

4. **Configure Docker-Compose**

   - **Relay Server:** The `relay-server` currently uses a `.env` file for basic
     config, find this in `./backend/relay-server. The only addition you _need_
     is a Base64 encoded private key for a persistent peer id.
   - **CoTURN Configuration:** The `coturn` service requires a
     `my-turnserver.conf` file. `coturn` uses a config file found at
     `./backend/relay-server/my-turnserver.conf`, you can customise this as you
     want/need to to suit your network environment.

5. **Start Backend Services with Docker Compose:** Navigate to the `backend`
   directory and start all services defined in `docker-compose.yaml`. This will
   launch the `coturn` server, `passphrase-server`, and `relay-server`.

   ```
   cd backend
   docker-compose up -d
   ```

   This command will run the services in detached mode, meaning they will run in
   the background.

6. **Run the Frontend Application:** Once the backend services are running,
   return to the root of your repo directory and start the frontend application.

   ```
   npm start
   ```

   This will typically start a development server and open FileFerry in your
   browser. Look for output in the terminal indicating the local URL (e.g.,
   `http://localhost:5173`).

7. **Optional: Build for Production:** To build the static website files for
   deployment, run:

   ```
   npm run build
   ```

   The compiled website files will be located in the `dist` directory, ready for
   static hosting.

<!-- USAGE EXAMPLES -->

## Usage

Here's a demo of the site:



https://github.com/user-attachments/assets/5d22f049-fa28-420c-9071-91076ef63763



Visit [fileferry.xyz](https://fileferry.xyz) to try it yourself!

<!-- ROADMAP -->

## Roadmap

- [x] File transfer resumption after broken or interrupted streams.
- [x] Favicons using the FileFerry logo.
- [x] Typescript conversion with TypeDoc documentation.
- [x] Acquire and hold wake lock while transferring.
- [ ] Make it easier to configure your own FileFerry instance, i.e. centralise
      all variables that need to be changed.
- [x] Night mode, with a moon and stars in the sky.
- [x] Direct links to transfers to facilitate easier sharing.
- [x] Share links to transfers.
- [x] QR Code links to transfers.
- [x] Prevent _trigger_ words being generated for passphrase.
- [x] Validate file integrity after transfer.

If you have any ideas or feedback, I would appreciate if you
[open an Issue](https://github.com/smp46/FileFerry/issues/new?labels=enhancement&template=feature-request---.md")
and let me know!

<!-- CONTRIBUTING -->

## Contributing

Contributions are what make the open source community such an amazing place to
learn, inspire, and create. Any contributions you make are **greatly
appreciated**.

If you have a suggestion that would make this better, please fork the repo and
create a pull request. You can also simply open an issue with the tag
"enhancement". Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Top contributors

<a href="https://github.com/smp46/FileFerry/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=smp46/FileFerry" alt="contrib.rocks image" />
</a>

<!-- LICENSE -->

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<!-- CONTACT -->

## Contact

Samuel - [Linkedin/smp46](https://www.linkedin.com/in/smp46/) - <me@smp46.me>

Project Link:
[https://github.com/smp46/FileFerry](https://github.com/smp46/FileFerry)

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[contributors-shield]:
  https://img.shields.io/github/contributors/smp46/FileFerry.svg?style=for-the-badge
[contributors-url]: https://github.com/smp46/FileFerry/graphs/contributors
[forks-shield]:
  https://img.shields.io/github/forks/smp46/FileFerry.svg?style=for-the-badge
[forks-url]: https://github.com/smp46/FileFerry/network/members
[stars-shield]:
  https://img.shields.io/github/stars/smp46/FileFerry.svg?style=for-the-badge
[stars-url]: https://github.com/smp46/FileFerry/stargazers
[issues-shield]:
  https://img.shields.io/github/issues/smp46/FileFerry.svg?style=for-the-badge
[issues-url]: https://github.com/smp46/FileFerry/issues
[license-shield]:
  https://img.shields.io/github/license/smp46/FileFerry?style=for-the-badge
[license-url]: https://github.com/smp46/FileFerry
[linkedin-shield]:
  https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/smp46
[product-screenshot]: public/screenshot.png
[js-libp2p]:
  https://img.shields.io/badge/js--libp2p-9400D3?style=for-the-badge&logo=ipfs&logoColor=white
[js-libp2p-url]: https://github.com/libp2p/js-libp2p
[JavaScript]:
  https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[TypeScript]:
  https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[HTML]:
  https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[HTML-url]: https://developer.mozilla.org/en-US/docs/Web/HTML
[Go]:
  https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white
[Go-url]: https://go.dev/
[CSS]:
  https://img.shields.io/badge/CSS-1572B6?style=for-the-badge&logo=css3&logoColor=white
[CSS-url]: https://developer.mozilla.org/en-US/docs/Web/CSS
[TailwindCSS]:
  https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[TailwindCSS-url]: https://tailwindcss.com/
[Docker]:
  https://img.shields.io/badge/Docker-384D54?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
[CoTURN]:
  https://img.shields.io/badge/CoTURN-4A4A4A?style=for-the-badge&logo=generic&logoColor=white
[CoTURN-url]: https://github.com/coturn/coturn
