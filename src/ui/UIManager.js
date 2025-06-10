export class UIManager {
  constructor(appState) {
    this.appState = appState;
    this.elements = this.getUIElements();
  }

  // UI state management
  showSenderMode() {
    this.hideElement('initialDropUI');
    this.showElement('fileInfoArea');
  }

  showReceiverMode() {
    this.hideElement('initialReceiveUI');
    this.showElement('receivingLoadingIndicator');
  }

  showIdleMode() {
    this.showElement('goSendButton');
    this.showElement('goReceiveButton');
    this.hideElement('returnButton');
    this.hideElement('sendWindow');
    this.hideElement('receiveWindow');
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

  showFileProgress(progress) {
    const { percentage, current, total, rate } = progress;
    this.updateProgressBar(percentage);
    this.updateElement('progressText', `${current} MB / ${total} MB`);
    this.updateElement('transferRate', `${rate} Mbps`);
  }

  showTransferComplete() {
    this.hideElement('loadingIndicator');
    this.showElement('completionMessage');
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
    const copyButton = this.elements.copyPhraseButton;
    const receiveModeButton = this.elements.receiveModeButton;

    copyButton.addEventListener('click', this.copyPhrase.bind(this));
    receiveModeButton.addEventListener('click', () => {
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
    const phraseElement = this.elements.generatedPhraseDisplay;
    phraseElement.innerText = phrase;
  }

  copyPhrase() {
    const phraseElement = this.elements.generatedPhraseDisplay;
    navigator.clipboard.writeText(phraseElement.innerText);
  }

  // UI utilities
  updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  showElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'block';
    }
  }

  hideElement(id) {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  }

  updateProgressBar(percentage) {
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }
  }

  getUIElements() {
    return {
      dropZone: document.getElementById('drop_zone'),
      fileInput: document.getElementById('fileInput'),
      copyPhraseButton: document.getElementById('copyPhraseButton'),
      receiveModeButton: document.getElementById('receiveModeButton'),
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
