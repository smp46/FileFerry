export class UIManager {
  constructor(appState) {
    this.appState = appState;
    this.elements = this.getUIElements();

    this.clearPhrase();
  }

  // UI state management
  showSenderMode() {
    this.hideElement('initialDropUI');
    this.showElement('fileInfoArea');
  }

  showSendingInProgress() {
    this.hideElement('fileInfoArea');
    this.showElement('sendInProgress');
  }

  showReceiverMode() {
    this.hideElement('initialReceiveUI');
    this.showElement('receiveInProgress');
  }

  showHome() {
    window.location.reload();
  }

  showSendWindow() {
    this.showElement('goBackButton', 'flex');
    this.hideElement('goSendButton');
    this.hideElement('goReceiveButton');
    this.showElement('sendWindow');
    this.hideElement('receiveWindow');
  }

  showReceiveWindow() {
    this.showElement('goBackButton', 'flex');
    this.hideElement('goSendButton');
    this.hideElement('goReceiveButton');
    this.showElement('receiveWindow');
    this.hideElement('sendWindow');
  }

  resetUI() {
    this.showIdleMode();
    this.clearFileDisplay();
    this.hideErrorPopup();
  }

  // File UI
  displaySelectedFile(file) {
    this.updateElement('fileNameDisplay', file.name);
    this.updateElement(
      'fileSizeDisplay',
      `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  showFileProgress(progress, mode) {
    const { percentage, current, total, rate } = progress;

    const progressBarId =
      mode === 'send' ? 'sendProgressBar' : 'receiveProgressBar';
    const progressTextId =
      mode === 'send' ? 'sendProgressText' : 'receiveProgressText';
    const transferRateId = mode === 'send' ? 'sendRate' : 'receiveRate';

    this.updateProgressBar(progressBarId, percentage);
    this.updateElement(progressTextId, `${current} MB / ${total} MB`);
    this.updateElement(transferRateId, `${rate} Mbps`);
  }

  showReceivedFileDetails(fileName, fileSize) {
    this.updateElement('receivedFileName', fileName);
    this.updateElement(
      'receivedFileSize',
      `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  showTransferComplete(mode) {
    const loadingIndicatorId =
      mode === 'send' ? 'sendInProgress' : 'receiveInProgress';
    const completionMessageId =
      mode === 'send' ? 'sendComplete' : 'receiveComplete';

    this.hideElement(loadingIndicatorId);
    this.showElement(completionMessageId);
  }

  updateProgressBar(id, percentage) {
    const progressBar = document.getElementById(id);
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }
  }

  clearFileDisplay() {
    this.updateElement('fileNameDisplay', '');
    this.updateElement('fileSizeDisplay', '');
  }

  // Error handling
  showErrorPopup(message) {
    this.updateElement('errorMessageText', message);
    this.elements.errorWindow.classList.remove('hidden');
  }

  hideErrorPopup() {
    this.elements.errorWindow.classList.add('hidden');
  }

  // Event handlers
  setupEventListeners() {
    this.setupFileHandlers();
    this.setupButtonHandlers();
    this.setupErrorHandlers();
  }

  setupFileHandlers() {
    const dropZone = this.elements.dropZone;
    const fileInput = this.elements.fileInput;

    dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
    dropZone.addEventListener('drop', this.handleFileDrop.bind(this));
    fileInput.addEventListener('change', this.handleFileSelect.bind(this));
  }

  setupButtonHandlers() {
    this.elements.selectFileButton.addEventListener('click', () =>
      this.elements.fileInput.click(),
    );

    this.elements.goSendButton.addEventListener(
      'click',
      this.showSendWindow.bind(this),
    );
    this.elements.goReceiveButton.addEventListener(
      'click',
      this.showReceiveWindow.bind(this),
    );
    this.elements.goBackButton.addEventListener(
      'click',
      this.showHome.bind(this),
    );

    this.elements.copyPhraseButton.addEventListener(
      'click',
      this.copyPhrase.bind(this),
    );
    this.elements.receiveModeButton.addEventListener('click', () => {
      const phraseInput = document.getElementById('phraseInput');
      const phraseValue = phraseInput.value.trim();

      if (!phraseValue) {
        this.showErrorPopup('Please enter a valid phrase.');
        return;
      }

      this.showReceiverMode();
      this.onPhraseEntered(phraseValue);
    });
  }

  setupErrorHandlers() {
    const errorWindow = this.elements.errorWindow;
    const closeErrorButton = this.elements.closeErrorButton;

    errorWindow.addEventListener('click', (event) => {
      if (event.target === errorWindow) {
        this.hideErrorPopup();
        this.resetUI();
      }
    });

    closeErrorButton.addEventListener('click', () => {
      this.hideErrorPopup();
      this.resetUI();
    });
  }

  handleDragOver(event) {
    event.preventDefault();
  }

  handleFileDrop(event) {
    event.preventDefault();

    let file = null;
    if (event.dataTransfer.items) {
      const item = [...event.dataTransfer.items].find(
        (item) => item.kind === 'file',
      );
      if (item) file = item.getAsFile();
    } else if (
      event.dataTransfer.files &&
      event.dataTransfer.files.length > 0
    ) {
      file = event.dataTransfer.files[0];
    }

    if (file) {
      this.appState.setSelectedFile(file);
      this.displaySelectedFile(file);
      this.onFileSelected(file);
    }
  }

  handleFileSelect(event) {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      this.appState.setSelectedFile(file);
      this.displaySelectedFile(file);
      this.onFileSelected(file);
    }
  }

  handlePhraseInput(event) {
    const phrase = event.target.value.trim();
    this.onPhraseEntered(phrase);
  }

  handleReceiveMode() {
    this.onReceiveModeRequested();
  }

  showPhrase(phrase) {
    this.updateElement('generatedPhraseDisplay', phrase);
  }

  copyPhrase() {
    navigator.clipboard.writeText(
      this.elements.generatedPhraseDisplay.innerText,
    );
  }

  clearPhrase() {
    document.getElementById('phraseInput').value = '';
  }

  // UI utilities
  updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  showElement(id, displayType = 'block') {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = displayType;
    }
  }

  hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  }

  getUIElements() {
    return {
      dropZone: document.getElementById('drop_zone'),
      fileInput: document.getElementById('fileInput'),
      copyPhraseButton: document.getElementById('copyPhraseButton'),
      receiveModeButton: document.getElementById('receiveModeButton'),
      goSendButton: document.getElementById('goSendButton'),
      goReceiveButton: document.getElementById('goReceiveButton'),
      goBackButton: document.getElementById('goBackButton'),
      selectFileButton: document.getElementById('selectFileButton'),
      errorWindow: document.getElementById('errorWindow'),
      closeErrorButton: document.getElementById('closeErrorButton'),
      generatedPhraseDisplay: document.getElementById('generatedPhraseDisplay'),
    };
  }

  // Callback methods (to be overridden)
  onFileSelected(file) {}

  onPhraseEntered(phrase) {}

  onReceiveModeRequested() {}
}
