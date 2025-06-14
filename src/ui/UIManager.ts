// ui/UIManager.ts
import type { AppState } from '@/core/AppState';

/**
 * Interface for the collection of UI elements.
 * @internal
 */
interface UIElements {
  dropZone: HTMLElement | null;
  fileInput: HTMLInputElement | null;
  copyPhraseButton: HTMLElement | null;
  receiveModeButton: HTMLElement | null;
  goSendButton: HTMLElement | null;
  goReceiveButton: HTMLElement | null;
  goBackButton: HTMLElement | null;
  selectFileButton: HTMLElement | null;
  errorWindow: HTMLElement | null;
  closeErrorButton: HTMLElement | null;
  generatedPhraseDisplay: HTMLElement | null;
  sun: HTMLElement | null;
  moon: HTMLElement | null;
}

/**
 * Interface for the progress data object.
 * @internal
 */
interface ProgressData {
  percentage: number;
  current: string;
  total: string;
  rate: string;
}

/**
 * Handles all direct manipulation of the DOM, updates UI state,
 * and listens for user input events.
 */
export class UIManager {
  private appState: AppState;
  private elements: UIElements;
  private theme: 'light' | 'dark' = 'light';

  /**
   * A callback function executed when a file is selected.
   * @param file - The file that was selected.
   */
  public onFileSelected: (file: File) => void = () => {};

  /**
   * A callback function executed when a user enters a phrase.
   * @param phrase - The phrase entered by the user.
   */
  public onPhraseEntered: (phrase: string) => void = () => {};

  /**
   * A callback function executed when the user requests to enter receive mode.
   */
  public onReceiveModeRequested: () => void = () => {};

  /**
   * Initializes the UI Manager.
   * @param appState - An instance of the AppState.
   */
  public constructor(appState: AppState) {
    this.appState = appState;
    this.elements = this.getUIElements();
    this.theme = this.getSystemTheme();
    this.clearPhrase();
  }

  /**
   * Switches the UI to the sender view after a file is selected.
   */
  public showSenderMode(): void {
    this.hideElement('initialDropUI');
    this.showElement('fileInfoArea');
  }

  /**
   * Switches the UI to show that a file transfer is in progress.
   */
  public showSendingInProgress(): void {
    this.hideElement('fileInfoArea');
    this.showElement('sendInProgress');
  }

  /**
   * Switches the UI to the receiver view for phrase input.
   */
  public showReceiverMode(): void {
    this.hideElement('initialReceiveUI');
    this.showElement('receiveInProgress');
  }

  /**
   * Returns the UI to the initial home screen.
   */
  public showHome(): void {
    window.location.reload();
  }

  /**
   * Shows the main "Send File" window.
   */
  public showSendWindow(): void {
    this.showElement('goBackButton', 'flex');
    this.hideElement('goSendButton');
    this.hideElement('goReceiveButton');
    this.showElement('sendWindow');
    this.hideElement('receiveWindow');
  }

  /**
   * Shows the main "Receive File" window.
   */
  public showReceiveWindow(): void {
    this.showElement('goBackButton', 'flex');
    this.hideElement('goSendButton');
    this.hideElement('goReceiveButton');
    this.showElement('receiveWindow');
    this.hideElement('sendWindow');
  }

  /**
   * Resets the UI to its default idle state.
   */
  public resetUI(): void {
    this.showHome();
    this.clearFileDisplay();
    this.hideErrorPopup();
  }

  /**
   * Gets the current theme from localStorage, or if not stored, from the system preference.
   */
  private initTheme(): void {
    this.theme =
      (localStorage.theme as 'light' | 'dark') || this.getSystemTheme();
  }

  /**
   * Changes the theme between light and dark modes.
   * Stores the selected theme in localStorage.
   */
  public toggleTheme(): void {
    if (this.theme === 'light') {
      this.theme = 'dark';
      localStorage.theme = 'dark';
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      this.theme = 'light';
      localStorage.theme = 'light';
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }

  /**
   * Gets the current system theme preference.
   * @returns 'dark' if the system is in dark mode, 'light' otherwise.
   */
  private getSystemTheme(): 'dark' | 'light' {
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      localStorage.theme = 'dark';
      return 'dark';
    }
    localStorage.theme = 'light';
    return 'light';
  }

  /**
   * Displays the name and size of the selected file.
   * @param file - The file to display information for.
   */
  public displaySelectedFile(file: File): void {
    this.updateElement('fileNameDisplay', file.name);
    this.updateElement(
      'fileSizeDisplay',
      `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  /**
   * Updates the file progress indicators.
   * @param progress - An object containing progress information.
   * @param mode - The current transfer mode ('send' or 'receive').
   */
  public showFileProgress(
    progress: ProgressData,
    mode: 'send' | 'receive',
  ): void {
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

  /**
   * Displays details of a successfully received file.
   * @param fileName - The name of the received file.
   * @param fileSize - The size of the received file in bytes.
   */
  public showReceivedFileDetails(fileName: string, fileSize: number): void {
    this.updateElement('receivedFileName', fileName);
    this.updateElement(
      'receivedFileSize',
      `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  /**
   * Shows the transfer completion message.
   * @param mode - The transfer mode that completed ('send' or 'receive').
   */
  public showTransferComplete(mode: 'send' | 'receive'): void {
    const loadingIndicatorId =
      mode === 'send' ? 'sendInProgress' : 'receiveInProgress';
    const completionMessageId =
      mode === 'send' ? 'sendComplete' : 'receiveComplete';

    this.hideElement(loadingIndicatorId);
    this.showElement(completionMessageId);
  }

  /**
   * Updates the width of a progress bar element.
   * @param id - The ID of the progress bar element.
   * @param percentage - The percentage to set the width to.
   */
  public updateProgressBar(id: string, percentage: number): void {
    const progressBar = document.getElementById(id);
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }
  }

  /**
   * Clears the selected file display area.
   */
  public clearFileDisplay(): void {
    this.updateElement('fileNameDisplay', '');
    this.updateElement('fileSizeDisplay', '');
  }

  /**
   * Displays the error popup with a message.
   * @param message - The error message to display.
   */
  public showErrorPopup(message: string): void {
    this.updateElement('errorMessageText', message);
    this.elements.errorWindow?.classList.remove('hidden');
  }

  /**
   * Hides the error popup.
   */
  public hideErrorPopup(): void {
    this.elements.errorWindow?.classList.add('hidden');
  }

  /**
   * Sets up all UI event listeners.
   */
  public setupEventListeners(): void {
    this.setupFileHandlers();
    this.setupButtonHandlers();
    this.setupErrorHandlers();
  }

  /**
   * Sets up event listeners for file drag-and-drop and selection.
   * @internal
   */
  private setupFileHandlers(): void {
    const dropZone = this.elements.dropZone;
    const fileInput = this.elements.fileInput;

    dropZone?.addEventListener('dragover', this.handleDragOver.bind(this));
    dropZone?.addEventListener('drop', this.handleFileDrop.bind(this));
    fileInput?.addEventListener('change', this.handleFileSelect.bind(this));
  }

  /**
   * Sets up event listeners for all buttons.
   * @internal
   */
  private setupButtonHandlers(): void {
    this.elements.sun?.addEventListener('click', () => this.toggleTheme());

    this.elements.moon?.addEventListener('click', () => this.toggleTheme());

    this.elements.selectFileButton?.addEventListener('click', () =>
      this.elements.fileInput?.click(),
    );

    this.elements.goSendButton?.addEventListener(
      'click',
      this.showSendWindow.bind(this),
    );
    this.elements.goReceiveButton?.addEventListener(
      'click',
      this.showReceiveWindow.bind(this),
    );
    this.elements.goBackButton?.addEventListener(
      'click',
      this.showHome.bind(this),
    );

    this.elements.copyPhraseButton?.addEventListener(
      'click',
      this.copyPhrase.bind(this),
    );
    this.elements.receiveModeButton?.addEventListener('click', () => {
      const phraseInput = document.getElementById(
        'phraseInput',
      ) as HTMLInputElement;
      const phraseValue = phraseInput.value.trim();

      if (!phraseValue) {
        this.showErrorPopup('Please enter a valid phrase.');
        return;
      }

      this.showReceiverMode();
      this.onPhraseEntered(phraseValue);
    });
  }

  /**
   * Sets up event listeners for the error popup.
   * @internal
   */
  private setupErrorHandlers(): void {
    const errorWindow = this.elements.errorWindow;
    const closeErrorButton = this.elements.closeErrorButton;

    errorWindow?.addEventListener('click', (event: MouseEvent) => {
      if (event.target === errorWindow) {
        this.hideErrorPopup();
        this.resetUI();
      }
    });

    closeErrorButton?.addEventListener('click', () => {
      this.hideErrorPopup();
      this.resetUI();
    });
  }

  /**
   * Handles the dragover event on the drop zone.
   * @param event - The DragEvent.
   * @internal
   */
  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  /**
   * Handles the drop event on the drop zone.
   * @param event - The DragEvent.
   * @internal
   */
  private handleFileDrop(event: DragEvent): void {
    event.preventDefault();

    let file: File | null = null;
    if (event.dataTransfer?.items) {
      const item = [...event.dataTransfer.items].find(
        (item) => item.kind === 'file',
      );
      if (item) {
        file = item.getAsFile();
      }
    } else if (
      event.dataTransfer?.files &&
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

  /**
   * Handles file selection via the file input.
   * @param event - The Event from the file input.
   * @internal
   */
  private handleFileSelect(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      this.appState.setSelectedFile(file);
      this.displaySelectedFile(file);
      this.onFileSelected(file);
    }
  }

  /**
   * Displays a generated phrase to the user.
   * @param phrase - The phrase to display.
   */
  public showPhrase(phrase: string): void {
    this.updateElement('generatedPhraseDisplay', phrase);
  }

  /**
   * Copies the generated phrase to the clipboard.
   */
  public copyPhrase(): void {
    if (this.elements.generatedPhraseDisplay?.innerText) {
      navigator.clipboard.writeText(
        this.elements.generatedPhraseDisplay.innerText,
      );
    }
  }

  /**
   * Clears the phrase input field.
   */
  public clearPhrase(): void {
    const phraseInput = document.getElementById(
      'phraseInput',
    ) as HTMLInputElement | null;
    if (phraseInput) {
      phraseInput.value = '';
    }
  }

  /**
   * A utility to update the text content of an element.
   * @param id - The ID of the element to update.
   * @param content - The new text content.
   * @internal
   */
  private updateElement(id: string, content: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = content;
    }
  }

  /**
   * A utility to show a hidden element.
   * @param id - The ID of the element to show.
   * @param displayType - The CSS display type to apply (e.g., 'block', 'flex').
   * @internal
   */
  private showElement(id: string, displayType: string = 'block'): void {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = displayType;
    }
  }

  /**
   * A utility to hide an element.
   * @param id - The ID of the element to hide.
   * @internal
   */
  private hideElement(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = 'none';
    }
  }

  /**
   * Retrieves all necessary UI elements from the DOM.
   * @returns An object containing references to the UI elements.
   * @internal
   */
  private getUIElements(): UIElements {
    return {
      dropZone: document.getElementById('drop_zone'),
      fileInput: document.getElementById('fileInput') as HTMLInputElement,
      copyPhraseButton: document.getElementById('copyPhraseButton'),
      receiveModeButton: document.getElementById('receiveModeButton'),
      goSendButton: document.getElementById('goSendButton'),
      goReceiveButton: document.getElementById('goReceiveButton'),
      goBackButton: document.getElementById('goBackButton'),
      selectFileButton: document.getElementById('selectFileButton'),
      errorWindow: document.getElementById('errorWindow'),
      closeErrorButton: document.getElementById('closeErrorButton'),
      generatedPhraseDisplay: document.getElementById('generatedPhraseDisplay'),
      sun: document.getElementById('sun'),
      moon: document.getElementById('moon'),
    };
  }
}
