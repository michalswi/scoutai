// Node.js modules for Electron
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { app } = require('@electron/remote');

const execAsync = promisify(exec);
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);

// Helper function to get the correct app path for both dev and production
function getAppPath(): string {
  try {
    // In packaged app, use app.getAppPath() which points to resources
    if (app.isPackaged) {
      return app.getAppPath();
    }
  } catch (e) {
    // Fallback if remote is not available
  }
  // In development, use process.cwd()
  return process.cwd();
}

// Helper function to find ollama executable
function getOllamaPath(): string {
  const { execSync } = require('child_process');
  
  try {
    // Try to get the full path using 'which' command
    return execSync('which ollama', { encoding: 'utf-8' }).trim();
  } catch (e) {
    // If which fails, try common installation paths
    const commonPaths = [
      '/usr/local/bin/ollama',
      '/opt/homebrew/bin/ollama',
      '/usr/bin/ollama',
      `${process.env.HOME}/.ollama/bin/ollama`
    ];
    
    const fs = require('fs');
    for (const testPath of commonPaths) {
      try {
        if (fs.existsSync(testPath)) {
          return testPath;
        }
      } catch (err) {
        // Continue checking
      }
    }
  }
  
  // Fallback to just 'ollama' and hope it's in PATH
  return 'ollama';
}

// Declare Leaflet and Google Maps as global (loaded from CDN)
declare const L: any;
declare const google: any;

class TabManager {
  private tabBtns: NodeListOf<Element>;
  private tabContents: NodeListOf<Element>;

  constructor() {
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.setupTabs();
  }

  private setupTabs(): void {
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        this.switchTab(tabName!);
      });
    });
  }

  private switchTab(tabName: string): void {
    this.tabBtns.forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      }
    });

    this.tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      }
    });
  }
}

interface SavedLocation {
  location: string;
  details: string;
  timestamp: string;
}

class MapApp {
  private map: any;
  private marker: any;
  private currentTileLayer: any;
  private searchInput: HTMLInputElement;
  private searchBtn: HTMLButtonElement;
  private mapTypeSelect: HTMLSelectElement;
  private latInput: HTMLInputElement;
  private lonInput: HTMLInputElement;
  private goToCoordBtn: HTMLButtonElement;
  private findMeBtn: HTMLButtonElement;
  private currentCoords: HTMLSpanElement;
  private fullscreenBtn: HTMLButtonElement;
  private mapContainer: HTMLElement;
  private isFullscreen: boolean = false;
  private currentLocationName: string = '';
  private savedLocations: SavedLocation[] = [];
  private locationMarkers: any[] = [];
  private currentCommentPopup: any = null;
  private savedLocationsBtn: HTMLButtonElement | null = null;
  private savedLocationsModal: HTMLElement | null = null;
  private savedLocationsList: HTMLElement | null = null;
  private closeSavedLocationsModalBtn: HTMLButtonElement | null = null;

  constructor() {
    this.searchInput = document.getElementById('searchInput') as HTMLInputElement;
    this.searchBtn = document.getElementById('searchBtn') as HTMLButtonElement;
    this.mapTypeSelect = document.getElementById('mapType') as HTMLSelectElement;
    this.latInput = document.getElementById('latInput') as HTMLInputElement;
    this.lonInput = document.getElementById('lonInput') as HTMLInputElement;
    this.goToCoordBtn = document.getElementById('goToCoordBtn') as HTMLButtonElement;
    this.findMeBtn = document.getElementById('findMeBtn') as HTMLButtonElement;
    this.currentCoords = document.getElementById('currentCoords') as HTMLSpanElement;
    this.fullscreenBtn = document.getElementById('mapFullscreenBtn') as HTMLButtonElement;
    this.mapContainer = document.querySelector('.map-container') as HTMLElement;

    this.setupSavedLocationsUI();
    this.initMap();
    this.setupEventListeners();
    // Ensure map resizes and recenters when window size changes or when OSM tab becomes active
    window.addEventListener('resize', () => this.resizeAndCenter());
    // Listen for tab button clicks to detect when osm tab becomes active
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        if (tabName === 'osm') {
          // small timeout to allow CSS/display to update
          setTimeout(() => this.resizeAndCenter(), 100);
        }
      });
    });
    
    // Load saved locations
    this.loadLocations();
    
    console.log('MapApp: Initialized');
  }

  // Make leafet recalculate size and center marker
  private resizeAndCenter(): void {
    try {
      if (this.map) {
        this.map.invalidateSize();
        // If there's a marker, center the map on it
        if (this.marker) {
          const pos = this.marker.getLatLng();
          this.map.setView([pos.lat, pos.lng]);
        }
      }
    } catch (err) {
      console.warn('resizeAndCenter failed:', err);
    }
  }

  private initMap(): void {
    const defaultLat = 51.109935;
    const defaultLon = 17.031770;

    this.map = L.map('map').setView([defaultLat, defaultLon], 13);

    this.currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);

    this.marker = L.marker([defaultLat, defaultLon], { draggable: true }).addTo(this.map);
    this.marker.bindPopup('Wrocław, Poland').openPopup();

    this.updateCoordinates(defaultLat, defaultLon);

    this.map.on('click', (e: any) => {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      
      // Ask user if they want to add a comment
      this.showAddCommentDialog(lat, lon);
    });

    this.marker.on('dragend', () => {
      const pos = this.marker.getLatLng();
      this.updateCoordinates(pos.lat, pos.lng);
    });
  }

  private setupEventListeners(): void {
    this.searchBtn.addEventListener('click', () => this.searchPlace());
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.searchPlace();
      }
    });

    this.mapTypeSelect.addEventListener('change', () => this.switchMapType());
    this.goToCoordBtn.addEventListener('click', () => this.goToCoordinates());
    this.findMeBtn.addEventListener('click', () => this.findMyLocation());
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    
    // Add Escape key handler for fullscreen
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return;
      }

      if (this.isFullscreen) {
        this.toggleFullscreen();
        return;
      }

      if (this.isSavedLocationsModalOpen()) {
        this.closeSavedLocationsModal();
      }
    });
    
    console.log('MapApp: Event listeners set up');
  }

  private setupSavedLocationsUI(): void {
    this.savedLocationsBtn = document.getElementById('savedLocationsBtn') as HTMLButtonElement | null;
    this.savedLocationsModal = document.getElementById('savedLocationsModal');
    this.savedLocationsList = document.getElementById('savedLocationsList');
    this.closeSavedLocationsModalBtn = document.getElementById('closeSavedLocationsModal') as HTMLButtonElement | null;

    this.savedLocationsBtn?.addEventListener('click', () => this.openSavedLocationsModal());
    this.closeSavedLocationsModalBtn?.addEventListener('click', () => this.closeSavedLocationsModal());

    this.savedLocationsModal?.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target === this.savedLocationsModal) {
        this.closeSavedLocationsModal();
      }
    });

    this.updateSavedLocationsButtonState();
  }

  private openSavedLocationsModal(): void {
    if (!this.savedLocationsModal) {
      return;
    }

    this.renderSavedLocationsList();
    this.savedLocationsModal.classList.add('show');
  }

  private closeSavedLocationsModal(): void {
    this.savedLocationsModal?.classList.remove('show');
  }

  private isSavedLocationsModalOpen(): boolean {
    return this.savedLocationsModal?.classList.contains('show') ?? false;
  }

  private renderSavedLocationsList(): void {
    if (!this.savedLocationsList) {
      return;
    }

    this.savedLocationsList.innerHTML = '';

    if (!this.savedLocations.length) {
      const emptyState = document.createElement('div');
      emptyState.className = 'saved-locations-empty';
      emptyState.textContent = 'No saved locations yet.';
      this.savedLocationsList.appendChild(emptyState);
      return;
    }

    const sortedLocations = [...this.savedLocations].sort((a, b) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    for (const location of sortedLocations) {
      const [latStr, lonStr] = location.location.split(',');
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);

      const card = document.createElement('div');
      card.className = 'saved-location-card';
      card.tabIndex = 0;

      const firstLine = location.details
        .split('\n')
        .map(line => line.trim())
        .find(Boolean);
      const titleText = firstLine ? this.truncateText(firstLine, 80) : 'Untitled note';

      const titleRow = document.createElement('div');
      titleRow.className = 'saved-location-title';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = titleText;

      const coordSpan = document.createElement('span');
      coordSpan.className = 'saved-location-coords';
      coordSpan.textContent = location.location;

      titleRow.appendChild(titleSpan);
      titleRow.appendChild(coordSpan);

      const preview = document.createElement('div');
      preview.className = 'saved-location-preview';
      const normalizedDetails = location.details.replace(/\s+/g, ' ').trim();
      preview.textContent = normalizedDetails ? this.truncateText(normalizedDetails, 180) : 'No additional notes yet.';

      const metaRow = document.createElement('div');
      metaRow.className = 'saved-location-meta';

      const timestampSpan = document.createElement('span');
      timestampSpan.textContent = new Date(location.timestamp).toLocaleString();

      const actionsWrapper = document.createElement('div');
      actionsWrapper.className = 'saved-location-actions';

      const jumpHint = document.createElement('span');
      jumpHint.className = 'saved-location-jump';
      jumpHint.textContent = 'Jump ↗';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'saved-location-delete-btn';
      deleteBtn.title = 'Delete this location';
      deleteBtn.textContent = '🗑️';
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();
        const confirmed = window.confirm('Delete this saved location?');
        if (!confirmed) {
          return;
        }
        await this.deleteLocation(location);
      });

      actionsWrapper.appendChild(jumpHint);
      actionsWrapper.appendChild(deleteBtn);

      metaRow.appendChild(timestampSpan);
      metaRow.appendChild(actionsWrapper);

      card.appendChild(titleRow);
      card.appendChild(preview);
      card.appendChild(metaRow);

      const jumpToLocation = () => {
        if (isNaN(lat) || isNaN(lon)) {
          alert('Could not read coordinates for this saved location.');
          return;
        }
        this.navigateToLocation(lat, lon, titleText || location.location);
        this.closeSavedLocationsModal();
      };

      card.addEventListener('click', jumpToLocation);
      card.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          jumpToLocation();
        }
      });

      this.savedLocationsList.appendChild(card);
    }
  }

  private updateSavedLocationsButtonState(): void {
    if (!this.savedLocationsBtn) {
      return;
    }

    const count = this.savedLocations.length;
    this.savedLocationsBtn.textContent = `📘 Saved Locations (${count})`;
  }

  private truncateText(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    const cutoff = Math.max(maxLength - 3, 0);
    return `${value.slice(0, cutoff)}...`;
  }

  private toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    
    if (this.isFullscreen) {
      this.mapContainer.classList.add('fullscreen');
      this.fullscreenBtn.textContent = '⛶';
      this.fullscreenBtn.title = 'Exit Fullscreen';
    } else {
      this.mapContainer.classList.remove('fullscreen');
      this.fullscreenBtn.textContent = '⛶';
      this.fullscreenBtn.title = 'Toggle Fullscreen';
    }
    
    // Let map know size changed
    setTimeout(() => this.resizeAndCenter(), 100);
  }

  private switchMapType(): void {
    const mapType = this.mapTypeSelect.value;
    
    if (this.currentTileLayer) {
      this.map.removeLayer(this.currentTileLayer);
    }

    switch (mapType) {
      case 'street':
        this.currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19
        });
        break;
      case 'dark':
        this.currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap © CARTO',
          maxZoom: 19
        });
        break;
      case 'satellite':
        this.currentTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
          attribution: '© Google Maps',
          maxZoom: 20
        });
        break;
    }

    this.currentTileLayer.addTo(this.map);
  }

  private updateCoordinates(lat: number, lon: number): void {
    this.latInput.value = lat.toFixed(6);
    this.lonInput.value = lon.toFixed(6);
    this.currentCoords.textContent = `Current: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  private async searchPlace(): Promise<void> {
    const query = this.searchInput.value.trim();
    if (!query) {
      alert('Please enter a place to search');
      return;
    }
    // Debounce: if a search is already pending, bail
    if ((this.searchBtn as any)._searchPending) return;
    (this.searchBtn as any)._searchPending = true;

    // Provide immediate feedback in UI
    const prevCoordsText = this.currentCoords.textContent || '';
    const prevBtnHtml = this.searchBtn.innerHTML;
    this.currentCoords.textContent = 'Searching...';
    this.searchBtn.disabled = true;
    this.searchBtn.innerHTML = '⏳ Searching...';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'scoutai/1.0 (desktop app)',
          'Accept-Language': 'en'
        }
      });
      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }
      const data = await response.json();

      if (data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        this.currentLocationName = result.display_name;
        this.map.setView([lat, lon], 13);
        this.marker.setLatLng([lat, lon]);
        this.marker.bindPopup(`<b>${result.display_name}</b>`).openPopup();
        this.updateCoordinates(lat, lon);
      } else {
        alert('Place not found');
        this.currentCoords.textContent = prevCoordsText;
      }
    } catch (error: any) {
      alert(`Search error: ${error.message}`);
      this.currentCoords.textContent = prevCoordsText;
    } finally {
      clearTimeout(timeout);
      this.searchBtn.disabled = false;
      // restore button label
      try { this.searchBtn.innerHTML = prevBtnHtml; } catch (e) { /* ignore */ }
      (this.searchBtn as any)._searchPending = false;
    }
    
  }

  private goToCoordinates(): void {
    const lat = parseFloat(this.latInput.value);
    const lon = parseFloat(this.lonInput.value);

    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      alert('Coordinates out of range');
      return;
    }

    this.map.setView([lat, lon], 13);
    this.marker.setLatLng([lat, lon]);
    this.marker.bindPopup(`Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`).openPopup();
    this.updateCoordinates(lat, lon);
  }

  // Public method to navigate to location from external calls (e.g., from chat)
  public navigateToLocation(lat: number, lon: number, label?: string): void {
    console.log(`MapApp: navigateToLocation called with lat=${lat}, lon=${lon}, label=${label}`);
    
    if (isNaN(lat) || isNaN(lon)) {
      console.error('Invalid coordinates provided to navigateToLocation');
      return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      console.error('Coordinates out of range');
      return;
    }

    // Switch to OSM tab
    const osmTabBtn = document.querySelector('[data-tab="osm"]') as HTMLElement;
    if (osmTabBtn) {
      osmTabBtn.click();
    }

    // Small delay to ensure tab is visible before manipulating map
    setTimeout(() => {
      this.map.setView([lat, lon], 13);
      this.marker.setLatLng([lat, lon]);
      const popupText = label || `Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}`;
      this.marker.bindPopup(popupText).openPopup();
      this.updateCoordinates(lat, lon);
      this.resizeAndCenter();
    }, 150);
  }

  // Public method to search for a place from external calls
  public async navigateToPlace(placeName: string): Promise<void> {
    console.log(`MapApp: navigateToPlace called with "${placeName}"`);
    
    // Switch to OSM tab first
    const osmTabBtn = document.querySelector('[data-tab="osm"]') as HTMLElement;
    if (osmTabBtn) {
      osmTabBtn.click();
    }
    
    // Small delay to ensure tab is visible
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Set the search input and trigger search
    this.searchInput.value = placeName;
    console.log(`MapApp: Searching for "${placeName}"`);
    await this.searchPlace();
  }

  private findMyLocation(): void {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        this.map.setView([lat, lon], 13);
        this.marker.setLatLng([lat, lon]);
        this.marker.bindPopup('<b>Your Location</b>').openPopup();
        this.updateCoordinates(lat, lon);
      },
      (error) => {
        alert(`Unable to get your location: ${error.message}`);
      }
    );
  }

  private showAddCommentDialog(lat: number, lon: number): void {
    // Close any existing comment popup first
    if (this.currentCommentPopup) {
      this.map.closePopup(this.currentCommentPopup);
      this.currentCommentPopup = null;
    }

    // Create popup content with form
    const popupContent = document.createElement('div');
    popupContent.style.minWidth = '250px';
    popupContent.style.padding = '5px';

    const title = document.createElement('div');
    title.innerHTML = '<b>📍 Add Location Comment</b>';
    title.style.marginBottom = '8px';

    const coordInfo = document.createElement('div');
    coordInfo.textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    coordInfo.style.color = '#888';
    coordInfo.style.fontSize = '12px';
    coordInfo.style.marginBottom = '10px';

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Enter your comment or question...';
    textarea.style.width = '100%';
    textarea.style.minHeight = '80px';
    textarea.style.padding = '6px';
    textarea.style.marginBottom = '10px';
    textarea.style.fontSize = '13px';
    textarea.style.border = '1px solid #555';
    textarea.style.borderRadius = '4px';
    textarea.style.backgroundColor = '#2a2a2a';
    textarea.style.color = '#e0e0e0';
    textarea.style.fontFamily = 'inherit';
    textarea.style.resize = 'vertical';

    // Add AI checkbox
    const aiCheckboxContainer = document.createElement('div');
    aiCheckboxContainer.style.marginBottom = '10px';
    aiCheckboxContainer.style.display = 'flex';
    aiCheckboxContainer.style.alignItems = 'center';
    aiCheckboxContainer.style.gap = '6px';

    const aiCheckbox = document.createElement('input');
    aiCheckbox.type = 'checkbox';
    aiCheckbox.id = 'askAiCheckbox';
    aiCheckbox.style.cursor = 'pointer';

    const aiLabel = document.createElement('label');
    aiLabel.htmlFor = 'askAiCheckbox';
    aiLabel.textContent = '🤖 Ask owrap AI';
    aiLabel.style.fontSize = '12px';
    aiLabel.style.cursor = 'pointer';
    aiLabel.style.userSelect = 'none';

    aiCheckboxContainer.appendChild(aiCheckbox);
    aiCheckboxContainer.appendChild(aiLabel);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '8px';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '5px 15px';
    saveBtn.style.backgroundColor = '#10b981';
    saveBtn.style.color = 'white';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.fontSize = '13px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '5px 15px';
    cancelBtn.style.backgroundColor = '#555';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontSize = '13px';

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);

    popupContent.appendChild(title);
    popupContent.appendChild(coordInfo);
    popupContent.appendChild(textarea);
    popupContent.appendChild(aiCheckboxContainer);
    popupContent.appendChild(buttonContainer);

    // Create a popup on the map
    const popup = (L as any).popup({
      closeButton: true,
      autoClose: false,
      closeOnClick: false,
      maxWidth: 300
    })
      .setLatLng([lat, lon])
      .setContent(popupContent)
      .openOn(this.map);

    // Store reference to current popup
    this.currentCommentPopup = popup;

    // Clear reference when popup is closed
    popup.on('remove', () => {
      if (this.currentCommentPopup === popup) {
        this.currentCommentPopup = null;
      }
    });

    // Focus on textarea after popup opens
    setTimeout(() => textarea.focus(), 100);

    saveBtn.addEventListener('click', async () => {
      const comment = textarea.value.trim();
      if (!comment) return;

      // Check if user wants AI to enhance the comment
      if (aiCheckbox.checked && globalOwrapApp) {
        try {
          // Disable buttons and show loading
          saveBtn.disabled = true;
          cancelBtn.disabled = true;
          saveBtn.textContent = '🤖 Asking AI...';
          textarea.disabled = true;
          aiCheckbox.disabled = true;

          // Ask AI (stays in background, OSM session)
          const aiResponse = await globalOwrapApp.askAI(comment);
          
          // Create enriched comment with question and answer
          const enrichedComment = `Q: ${comment}\n\nA: ${aiResponse}`;
          
          // Save location with enriched comment
          await this.addLocation(lat, lon, enrichedComment);
          
          // Close popup
          this.map.closePopup(popup);
        } catch (error: any) {
          // Show error and restore UI
          alert(`Failed to get AI response: ${error.message}`);
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          saveBtn.textContent = 'Save';
          textarea.disabled = false;
          aiCheckbox.disabled = false;
        }
      } else {
        // Save comment without AI
        await this.addLocation(lat, lon, comment);
        this.map.closePopup(popup);
      }
    });

    cancelBtn.addEventListener('click', () => {
      this.map.closePopup(popup);
    });

    // Enter key to save (Shift+Enter for new line)
    textarea.addEventListener('keydown', async (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const comment = textarea.value.trim();
        if (!comment) return;

        // Check if user wants AI to enhance the comment
        if (aiCheckbox.checked && globalOwrapApp) {
          try {
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            saveBtn.textContent = '🤖 Asking AI...';
            textarea.disabled = true;
            aiCheckbox.disabled = true;

            const aiResponse = await globalOwrapApp.askAI(comment);
            const enrichedComment = `Q: ${comment}\n\nA: ${aiResponse}`;
            await this.addLocation(lat, lon, enrichedComment);
            this.map.closePopup(popup);
          } catch (error: any) {
            alert(`Failed to get AI response: ${error.message}`);
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            saveBtn.textContent = 'Save';
            textarea.disabled = false;
            aiCheckbox.disabled = false;
          }
        } else {
          await this.addLocation(lat, lon, comment);
          this.map.closePopup(popup);
        }
      }
    });
  }

  private async addLocation(lat: number, lon: number, details: string): Promise<void> {
    const location: SavedLocation = {
      location: `${lat.toFixed(6)},${lon.toFixed(6)}`,
      details: details,
      timestamp: new Date().toISOString()
    };

    this.savedLocations.push(location);
    await this.saveLocationsToFile();
    this.displayLocationMarker(location);
    this.updateSavedLocationsButtonState();
    if (this.isSavedLocationsModalOpen()) {
      this.renderSavedLocationsList();
    }
  }

  private displayLocationMarker(location: SavedLocation): void {
    const [latStr, lonStr] = location.location.split(',');
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    const marker = (L as any).marker([lat, lon], {
      icon: (L as any).icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).addTo(this.map);
    (marker as any).__savedLocationTimestamp = location.timestamp;

    const popupDiv = document.createElement('div');
    popupDiv.style.minWidth = '250px';
    popupDiv.style.maxWidth = '400px';

    const header = document.createElement('div');
    header.innerHTML = `
      <b>📍 Saved Location</b><br>
      <small style="color: #888;">${location.location}</small>
    `;

    const contentDiv = document.createElement('div');
    contentDiv.style.marginTop = '8px';
    contentDiv.style.padding = '8px';
    contentDiv.style.background = '#2a2a2a';
    contentDiv.style.borderRadius = '4px';
    contentDiv.style.color = '#e0e0e0';
    contentDiv.style.maxHeight = '300px';
    contentDiv.style.overflowY = 'auto';
    contentDiv.style.fontSize = '13px';
    contentDiv.style.lineHeight = '1.5';
    
    // Use markdown formatting for the content
    if (globalOwrapApp) {
      contentDiv.innerHTML = globalOwrapApp.formatMarkdownPublic(location.details);
    } else {
      contentDiv.textContent = location.details;
    }

    const timestamp = document.createElement('small');
    timestamp.style.color = '#888';
    timestamp.style.display = 'block';
    timestamp.style.marginTop = '5px';
    timestamp.textContent = new Date(location.timestamp).toLocaleString();

    popupDiv.appendChild(header);
    popupDiv.appendChild(contentDiv);
    popupDiv.appendChild(timestamp);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️ Delete';
    deleteBtn.style.marginTop = '10px';
    deleteBtn.style.padding = '5px 10px';
    deleteBtn.style.backgroundColor = '#ef4444';
    deleteBtn.style.color = 'white';
    deleteBtn.style.border = 'none';
    deleteBtn.style.borderRadius = '4px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.style.width = '100%';

    deleteBtn.addEventListener('click', () => {
      this.deleteLocation(location, marker);
    });

    popupDiv.appendChild(deleteBtn);
    marker.bindPopup(popupDiv);
    
    // Add Esc key handler when popup opens
    marker.on('popupopen', () => {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          marker.closePopup();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);
      
      // Cleanup listener when popup closes
      marker.once('popupclose', () => {
        document.removeEventListener('keydown', handleEsc);
      });
    });
    
    this.locationMarkers.push(marker);
  }

  private async deleteLocation(location: SavedLocation, marker?: any): Promise<void> {
    // Remove from array
    const index = this.savedLocations.findIndex(loc => 
      loc.location === location.location && loc.timestamp === location.timestamp
    );
    if (index !== -1) {
      this.savedLocations.splice(index, 1);
    }

    let markerToRemove = marker;
    if (!markerToRemove) {
      markerToRemove = this.locationMarkers.find(m => (m as any).__savedLocationTimestamp === location.timestamp);
    }

    if (markerToRemove) {
      this.map.removeLayer(markerToRemove);
      const markerIndex = this.locationMarkers.indexOf(markerToRemove);
      if (markerIndex !== -1) {
        this.locationMarkers.splice(markerIndex, 1);
      }
    }

    // Save updated locations
    await this.saveLocationsToFile();
    this.updateSavedLocationsButtonState();
    if (this.isSavedLocationsModalOpen()) {
      this.renderSavedLocationsList();
    }
  }

  private async saveLocationsToFile(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const os = require('os');
      const omsDir = path.join(os.homedir(), 'Downloads', 'scoutai', 'oms');
      const locationsFile = path.join(omsDir, 'locations.json');

      // Create directory if it doesn't exist
      await fs.mkdir(omsDir, { recursive: true });

      // Write locations to file
      await fs.writeFile(locationsFile, JSON.stringify(this.savedLocations, null, 2), 'utf8');
      console.log('Locations saved to', locationsFile);
    } catch (error) {
      console.error('Error saving locations:', error);
      alert(`Failed to save location: ${error}`);
    }
  }

  private async loadLocations(): Promise<void> {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const os = require('os');
      const locationsFile = path.join(os.homedir(), 'Downloads', 'scoutai', 'oms', 'locations.json');

      // Check if file exists
      try {
        await fs.access(locationsFile);
      } catch {
        // File doesn't exist yet, that's okay
        console.log('No saved locations found');
        return;
      }

      // Read and parse file
      const data = await fs.readFile(locationsFile, 'utf8');
      this.savedLocations = JSON.parse(data);

      // Display all markers
      for (const location of this.savedLocations) {
        this.displayLocationMarker(location);
      }

      this.updateSavedLocationsButtonState();
      console.log(`Loaded ${this.savedLocations.length} saved locations`);
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  }
}

class GoogleMapsApp {
  private map: any;
  private directionsService: any;
  private directionsRenderer: any;
  private gmapStart: HTMLInputElement;
  private gmapEnd: HTMLInputElement;
  private travelMode: HTMLSelectElement;
  private getDirectionsBtn: HTMLButtonElement;
  private hasApiKey: boolean = false;
  private directionsPanel: HTMLElement;
  private mapsContainer: HTMLElement;
  private togglePanelSideBtn: HTMLButtonElement;
  private resizeHandle: HTMLElement;
  private isResizing: boolean = false;
  private panelOnRight: boolean = true;
  private gmapSearchInput: HTMLInputElement;
  private gmapSearchBtn: HTMLButtonElement;
  private gmapClearBtn: HTMLButtonElement;
  private geocoder: any;
  private searchMarker: any;
  private gmapApiKeyInput: HTMLInputElement;
  private saveApiKeyBtn: HTMLButtonElement;
  private removeApiKeyBtn: HTMLButtonElement;
  private apiKeyStatus: HTMLElement;
  private apiKey: string = '';
  private googleMapsLoaded: boolean = false;
  private toggleApiKeyBtn: HTMLButtonElement;
  private toggleDirectionsBtn: HTMLButtonElement;
  private apiKeyContent: HTMLElement;
  private directionsContent: HTMLElement;
  private apiKeyExpanded: boolean = false;
  private directionsExpanded: boolean = true;
  private gmapsTabStatusLight: HTMLElement;
  private apiKeyStatusLight: HTMLElement;
  private placesService: any;
  private currentInfoWindow: any = null;
  private startMarker: any = null;
  private endMarker: any = null;
  private lastCenter: any = null;

  constructor() {
    this.gmapStart = document.getElementById('gmapStart') as HTMLInputElement;
    this.gmapEnd = document.getElementById('gmapEnd') as HTMLInputElement;
    this.travelMode = document.getElementById('travelMode') as HTMLSelectElement;
    this.getDirectionsBtn = document.getElementById('getDirectionsBtn') as HTMLButtonElement;
    this.directionsPanel = document.getElementById('directionsPanel') as HTMLElement;
    this.mapsContainer = document.querySelector('.google-maps-container') as HTMLElement;
    this.togglePanelSideBtn = document.getElementById('togglePanelSideBtn') as HTMLButtonElement;
    this.resizeHandle = document.querySelector('.resize-handle-horizontal') as HTMLElement;
    this.gmapSearchInput = document.getElementById('gmapSearchInput') as HTMLInputElement;
    this.gmapSearchBtn = document.getElementById('gmapSearchBtn') as HTMLButtonElement;
    this.gmapClearBtn = document.getElementById('gmapClearBtn') as HTMLButtonElement;
    this.gmapApiKeyInput = document.getElementById('gmapApiKeyInput') as HTMLInputElement;
    this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn') as HTMLButtonElement;
    this.removeApiKeyBtn = document.getElementById('removeApiKeyBtn') as HTMLButtonElement;
    this.apiKeyStatus = document.getElementById('apiKeyStatus') as HTMLElement;
    this.toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn') as HTMLButtonElement;
    this.toggleDirectionsBtn = document.getElementById('toggleDirectionsBtn') as HTMLButtonElement;
    this.apiKeyContent = document.getElementById('apiKeyContent') as HTMLElement;
    this.directionsContent = document.getElementById('directionsContent') as HTMLElement;
    this.gmapsTabStatusLight = document.getElementById('gmapsTabStatus') as HTMLElement;
    this.apiKeyStatusLight = document.getElementById('apiKeyStatusLight') as HTMLElement;

    // Resize/center when Google tab is activated
    const googleTabBtn = document.querySelector('.tab-btn[data-tab="google"]');
    if (googleTabBtn) {
      googleTabBtn.addEventListener('click', () => this.handleTabActivated());
    }

    // Initialize panel position
    this.mapsContainer.classList.add('panel-right');

    // Load collapsed states
    this.loadCollapsedStates();
    // Load saved API key
    this.loadApiKey();
    this.setupEventListeners();
    this.setupResizeHandler();
  }

  private loadApiKey(): void {
    try {
      const savedKey = localStorage.getItem('googleMapsApiKey');
      if (savedKey) {
        this.apiKey = savedKey;
        this.gmapApiKeyInput.value = this.maskApiKey(savedKey);
        this.loadGoogleMapsScript(savedKey);
        this.updateApiKeyStatus('✅ API Key loaded', 'success');
        this.updateStatusLights(true);
      } else {
        this.showNoApiKeyMessage();
        this.updateApiKeyStatus('⚠️ No API Key configured', 'warning');
        this.updateStatusLights(false);
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
      this.showNoApiKeyMessage();
      this.updateApiKeyStatus('❌ Failed to load API key', 'error');
      this.updateStatusLights(false);
    }
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return key;
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
  }

  private updateApiKeyStatus(message: string, type: 'success' | 'warning' | 'error'): void {
    this.apiKeyStatus.textContent = message;
    this.apiKeyStatus.className = `api-key-status ${type}`;
  }

  private loadGoogleMapsScript(apiKey: string): void {
    if (this.googleMapsLoaded) {
      this.initGoogleMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      this.googleMapsLoaded = true;
      this.hasApiKey = true;
      this.initGoogleMap();
      this.updateApiKeyStatus('✅ Google Maps loaded successfully', 'success');
      this.updateStatusLights(true);
    };
    
    script.onerror = () => {
      this.updateApiKeyStatus('❌ Failed to load Google Maps. Check your API key.', 'error');
      this.showNoApiKeyMessage();
      this.updateStatusLights(false);
    };
    
    document.head.appendChild(script);
  }

  private showNoApiKeyMessage(): void {
    const panelContent = document.getElementById('directionsPanelContent')!;
    const mapDiv = document.getElementById('googleMap')!;
    
    mapDiv.style.display = 'none';
    panelContent.innerHTML = `
      <div style="padding:30px;text-align:center;">
        <h3 style="color:#e67e22;">⚠️ Google Maps API Key Not Configured</h3>
        <p>Enter your API key above to enable embedded maps.</p>
        <p style="margin-top:20px;"><strong>To get a Google Maps API key:</strong></p>
        <ol style="text-align:left;max-width:500px;margin:20px auto;">
          <li>Go to <a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank">Google Cloud Console</a></li>
          <li>Create a new project or select existing one</li>
          <li>Enable "Maps JavaScript API" and "Geocoding API"</li>
          <li>Create credentials (API key)</li>
          <li>Copy the API key and paste it in the field above</li>
          <li>Click "Save Key" to store it</li>
        </ol>
        <p style="margin-top:15px;color:#888;font-size:13px;">Without an API key, the app will open Google Maps in your browser.</p>
      </div>
    `;
    this.directionsPanel.classList.add('visible');
  }

  private initGoogleMap(): void {
    const defaultCenter = { lat: 51.109935, lng: 17.031770 };
    
    this.map = new google.maps.Map(document.getElementById('googleMap'), {
      zoom: 13,
      center: defaultCenter,
    });

    this.lastCenter = defaultCenter;

    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer();
    this.directionsRenderer.setMap(this.map);
    this.directionsRenderer.setPanel(document.getElementById('directionsPanelContent'));
    
    // Initialize geocoder for place search
    this.geocoder = new google.maps.Geocoder();
    
    // Initialize Places service
    this.placesService = new google.maps.places.PlacesService(this.map);

    // Track center so we can restore it on resize
    this.map.addListener('center_changed', () => {
      this.lastCenter = this.map.getCenter();
    });
    
    // Add right-click context menu for setting pins
    this.setupMapContextMenu();
    
    // Add click listener for places
    this.map.addListener('click', (e: any) => {
      this.handleMapClick(e);
    });
  }

  private setupEventListeners(): void {
    this.getDirectionsBtn.addEventListener('click', () => {
      if (this.hasApiKey) {
        this.calculateRoute();
      } else {
        this.openInGoogleMaps();
      }
    });

    this.togglePanelSideBtn.addEventListener('click', () => {
      this.togglePanelSide();
    });
    
    this.gmapSearchBtn.addEventListener('click', () => this.searchPlace());
    this.gmapSearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.searchPlace();
      }
    });
    this.gmapClearBtn.addEventListener('click', () => this.clearMap());
    this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
    this.removeApiKeyBtn.addEventListener('click', () => this.removeApiKey());
    this.gmapApiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveApiKey();
      }
    });
    this.toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeySection());
    this.toggleDirectionsBtn.addEventListener('click', () => this.toggleDirectionsSection());

    console.log('GoogleMapsApp: Event listeners set up');
  }

  private setupMapContextMenu(): void {
    this.map.addListener('rightclick', (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      
      // Create context menu
      const menuHtml = `
        <div style="background: white; padding: 4px; border-radius: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); min-width: 120px;">
          <div style="padding: 4px 8px; cursor: pointer; border-radius: 3px; font-size: 13px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="window.gmapSetStart(${lat}, ${lng})">📍 Set as Start</div>
          <div style="padding: 4px 8px; cursor: pointer; border-radius: 3px; font-size: 13px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="window.gmapSetEnd(${lat}, ${lng})">🎯 Set as Destination</div>
          <div style="padding: 4px 8px; cursor: pointer; border-radius: 3px; color: #888; font-size: 13px;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'" onclick="window.gmapCloseMenu()">✕ Cancel</div>
        </div>
      `;
      
      const infoWindow = new google.maps.InfoWindow({
        content: menuHtml,
        position: e.latLng
      });
      
      // Close previous menu if open
      if (this.currentInfoWindow) {
        this.currentInfoWindow.close();
      }
      
      this.currentInfoWindow = infoWindow;
      infoWindow.open(this.map);
      
      // Set up global functions for menu actions
      (window as any).gmapSetStart = (lat: number, lng: number) => {
        this.setStartPoint(lat, lng);
        infoWindow.close();
      };
      
      (window as any).gmapSetEnd = (lat: number, lng: number) => {
        this.setEndPoint(lat, lng);
        infoWindow.close();
      };
      
      (window as any).gmapCloseMenu = () => {
        infoWindow.close();
      };
    });
  }

  private async setStartPoint(lat: number, lng: number): Promise<void> {
    // Reverse geocode to get address
    this.geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        this.gmapStart.value = results[0].formatted_address;
        
        // Remove previous start marker
        if (this.startMarker) {
          this.startMarker.setMap(null);
        }
        
        // Add green marker for start
        this.startMarker = new google.maps.Marker({
          position: { lat, lng },
          map: this.map,
          title: 'Start: ' + results[0].formatted_address,
          label: { text: 'A', color: 'white' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2
          }
        });
      }
    });
  }

  private async setEndPoint(lat: number, lng: number): Promise<void> {
    // Reverse geocode to get address
    this.geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        this.gmapEnd.value = results[0].formatted_address;
        
        // Remove previous end marker
        if (this.endMarker) {
          this.endMarker.setMap(null);
        }
        
        // Add red marker for destination
        this.endMarker = new google.maps.Marker({
          position: { lat, lng },
          map: this.map,
          title: 'Destination: ' + results[0].formatted_address,
          label: { text: 'B', color: 'white' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2
          }
        });
      }
    });
  }

  private handleMapClick(e: any): void {
    // Use Places Nearby Search to find if there's a place at this location
    const request = {
      location: e.latLng,
      radius: 50, // 50 meters
      rankBy: google.maps.places.RankBy.DISTANCE
    };
    
    this.placesService.nearbySearch(request, (results: any[], status: string) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
        const place = results[0];
        this.showPlaceDetails(place.place_id);
      }
    });
  }

  private showPlaceDetails(placeId: string): void {
    const request = {
      placeId: placeId,
      fields: ['name', 'formatted_address', 'formatted_phone_number', 'opening_hours', 
               'website', 'rating', 'user_ratings_total', 'photos', 'reviews', 'price_level',
               'geometry', 'types', 'url']
    };
    
    this.placesService.getDetails(request, (place: any, status: string) => {
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        this.displayPlaceInfo(place);
      }
    });
  }

  private displayPlaceInfo(place: any): void {
    // Close previous info window
    if (this.currentInfoWindow) {
      this.currentInfoWindow.close();
    }
    
    let content = `<div style="max-width: 350px; max-height: 400px; overflow-y: auto; padding: 10px;">`;
    
    // Name
    content += `<h3 style="margin: 0 0 10px 0; font-size: 18px;">${place.name}</h3>`;
    
    // Rating
    if (place.rating) {
      const stars = '⭐'.repeat(Math.round(place.rating));
      content += `<div style="margin-bottom: 8px;">${stars} ${place.rating} (${place.user_ratings_total || 0} reviews)</div>`;
    }
    
    // Price level
    if (place.price_level) {
      const price = '$'.repeat(place.price_level);
      content += `<div style="margin-bottom: 8px; color: #10b981;">${price}</div>`;
    }
    
    // Photos
    if (place.photos && place.photos.length > 0) {
      content += `<div style="margin: 10px 0;">`;
      const photo = place.photos[0];
      const photoUrl = photo.getUrl({ maxWidth: 350, maxHeight: 200 });
      content += `<img src="${photoUrl}" style="width: 100%; border-radius: 8px; margin-bottom: 10px;" />`;
      content += `</div>`;
    }
    
    // Address
    if (place.formatted_address) {
      content += `<div style="margin: 8px 0; color: #666;">📍 ${place.formatted_address}</div>`;
    }
    
    // Phone
    if (place.formatted_phone_number) {
      content += `<div style="margin: 8px 0;">📞 <a href="tel:${place.formatted_phone_number}">${place.formatted_phone_number}</a></div>`;
    }
    
    // Website
    if (place.website) {
      content += `<div style="margin: 8px 0;">🌐 <a href="${place.website}" target="_blank">Website</a></div>`;
    }
    
    // Opening hours
    if (place.opening_hours) {
      const isOpen = place.opening_hours.isOpen ? place.opening_hours.isOpen() : false;
      const openStatus = isOpen ? '<span style="color: #10b981;">🟢 Open</span>' : '<span style="color: #ef4444;">🔴 Closed</span>';
      content += `<div style="margin: 8px 0;">${openStatus}</div>`;
      
      if (place.opening_hours.weekday_text) {
        content += `<div style="margin: 8px 0; font-size: 12px;">`;
        place.opening_hours.weekday_text.forEach((day: string) => {
          content += `<div style="color: #666;">${day}</div>`;
        });
        content += `</div>`;
      }
    }
    
    // Reviews
    if (place.reviews && place.reviews.length > 0) {
      content += `<div style="margin-top: 15px; border-top: 1px solid #e0e0e0; padding-top: 10px;">`;
      content += `<h4 style="margin: 0 0 10px 0; font-size: 14px;">Recent Reviews:</h4>`;
      
      // Show first 2 reviews
      place.reviews.slice(0, 2).forEach((review: any) => {
        const reviewStars = '⭐'.repeat(review.rating);
        content += `<div style="margin-bottom: 12px; padding: 8px; background: #f9f9f9; border-radius: 6px;">`;
        content += `<div style="font-weight: bold; margin-bottom: 4px;">${review.author_name} ${reviewStars}</div>`;
        content += `<div style="font-size: 12px; color: #666; margin-bottom: 4px;">${review.relative_time_description}</div>`;
        content += `<div style="font-size: 13px;">${review.text.substring(0, 150)}${review.text.length > 150 ? '...' : ''}</div>`;
        content += `</div>`;
      });
      content += `</div>`;
    }
    
    // Action buttons
    content += `<div style="margin-top: 15px; display: flex; gap: 8px; flex-wrap: wrap;">`;
    content += `<button onclick="window.gmapUseAsStart('${place.name.replace(/'/g, "\\'")}')"
                style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Set as Start</button>`;
    content += `<button onclick="window.gmapUseAsEnd('${place.name.replace(/'/g, "\\'")}')"
                style="padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Set as Destination</button>`;
    
    if (place.url) {
      content += `<a href="${place.url}" target="_blank"
                  style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; font-size: 12px; display: inline-block;">View on Google Maps</a>`;
    }
    content += `</div>`;
    
    content += `</div>`;
    
    // Set up global functions for button actions
    (window as any).gmapUseAsStart = (name: string) => {
      this.gmapStart.value = name;
      if (this.currentInfoWindow) {
        this.currentInfoWindow.close();
      }
    };
    
    (window as any).gmapUseAsEnd = (name: string) => {
      this.gmapEnd.value = name;
      if (this.currentInfoWindow) {
        this.currentInfoWindow.close();
      }
    };
    
    // Create info window
    const infoWindow = new google.maps.InfoWindow({
      content: content,
      position: place.geometry.location
    });
    
    this.currentInfoWindow = infoWindow;
    infoWindow.open(this.map);
    
    // Center map on place
    this.map.panTo(place.geometry.location);
  }

  private setupResizeHandler(): void {
    this.resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      this.isResizing = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      const startX = e.clientX;
      const startWidth = this.directionsPanel.offsetWidth;

      const handleMouseMove = (e: MouseEvent) => {
        if (!this.isResizing) return;

        const deltaX = this.panelOnRight ? (e.clientX - startX) : (startX - e.clientX);
        const newWidth = Math.max(250, Math.min(600, startWidth + deltaX));
        this.directionsPanel.style.width = `${newWidth}px`;
      };

      const handleMouseUp = () => {
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  private handleTabActivated(): void {
    if (!this.googleMapsLoaded || !this.map) return;
    const center = this.lastCenter || this.map.getCenter();
    google.maps.event.trigger(this.map, 'resize');
    if (center) {
      this.map.setCenter(center);
    }
  }

  private togglePanelSide(): void {
    this.panelOnRight = !this.panelOnRight;
    
    if (this.panelOnRight) {
      this.mapsContainer.classList.remove('panel-left');
      this.mapsContainer.classList.add('panel-right');
    } else {
      this.mapsContainer.classList.remove('panel-right');
      this.mapsContainer.classList.add('panel-left');
    }
  }

  private calculateRoute(): void {
    if (!this.googleMapsLoaded || !this.directionsService || !this.directionsRenderer) {
      alert('Loading Google Maps... please try again in a moment.');
      return;
    }

    const start = this.gmapStart.value.trim();
    const end = this.gmapEnd.value.trim();

    if (!start || !end) {
      alert('Please enter both start and destination');
      return;
    }

    const request: any = {
      origin: start,
      destination: end,
      travelMode: google.maps.TravelMode[this.travelMode.value],
      provideRouteAlternatives: true, // Enable alternative routes
    };

    // For TRANSIT mode, add departure time (now) to get current schedules
    if (this.travelMode.value === 'TRANSIT') {
      request.transitOptions = {
        departureTime: new Date(), // Use current time for transit schedules
      };
    }

    this.directionsService.route(request, (result: any, status: any) => {
      if (status === 'OK') {
        this.directionsPanel.classList.add('visible');
        this.directionsRenderer.setDirections(result);
      } else {
        let errorMessage = 'Directions request failed: ';
        
        switch (status) {
          case 'ZERO_RESULTS':
            if (this.travelMode.value === 'TRANSIT') {
              errorMessage += 'No transit route found. This may occur because:\n\n' +
                            '⚠️ Transit data availability varies by region\n' +
                            '- Google Maps API has limited transit data for some areas\n' +
                            '- Try more specific addresses (e.g., "Tokyo Station" instead of just "Tokyo")\n' +
                            '- Consider switching to DRIVING or WALKING mode\n' +
                            '- For Japan: use major station names or full addresses in Japanese\n\n' +
                            'Tip: If transit works on maps.google.com but not here, the API may lack that data.';
            } else {
              errorMessage += 'No route found between these locations. Please check:\n' +
                            '- Both addresses are valid and specific\n' +
                            '- Locations are accessible by the selected travel mode\n' +
                            '- Addresses are not too far apart or in disconnected regions';
            }
            break;
          case 'NOT_FOUND':
            errorMessage += 'One or both locations could not be found. Please use more specific addresses.';
            break;
          case 'INVALID_REQUEST':
            errorMessage += 'Invalid request. Please check your input.';
            break;
          case 'OVER_QUERY_LIMIT':
            errorMessage += 'Too many requests. Please wait a moment and try again.';
            break;
          case 'REQUEST_DENIED':
            errorMessage += 'Request denied. Please check your API key permissions.';
            break;
          case 'UNKNOWN_ERROR':
            errorMessage += 'Server error. Please try again.';
            break;
          default:
            errorMessage += status;
        }
        
        alert(errorMessage);
      }
    });
  }

  private openInGoogleMaps(): void {
    let start = this.gmapStart.value.trim();
    let end = this.gmapEnd.value.trim();

    if (!end) {
      alert('Please enter at least a destination');
      return;
    }

    if (!start) {
      start = 'My Location';
    }

    const baseUrl = 'https://www.google.com/maps/dir/';
    const url = `${baseUrl}${encodeURIComponent(start)}/${encodeURIComponent(end)}`;

    require('electron').shell.openExternal(url);
  }

  private searchPlace(): void {
    const query = this.gmapSearchInput.value.trim();
    
    if (!query) {
      alert('Please enter a place to search');
      return;
    }

    if (!this.hasApiKey) {
      // If no API key, open in browser
      const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      require('electron').shell.openExternal(url);
      return;
    }

    if (!this.googleMapsLoaded || !this.geocoder) {
      alert('Loading Google Maps... please try again in a moment.');
      return;
    }

    // Provide immediate feedback in UI
    const prevBtnHtml = this.gmapSearchBtn.innerHTML;
    this.gmapSearchBtn.disabled = true;
    this.gmapSearchBtn.innerHTML = '⏳ Searching...';

    // Use Geocoder to search for the place
    this.geocoder.geocode({ address: query }, (results: any[], status: string) => {
      try {
        if (status === 'OK' && results && results.length > 0) {
          const location = results[0].geometry.location;
          
          // Center map on location
          this.map.setCenter(location);
          this.map.setZoom(15);
          
          // Remove previous search marker if exists
          if (this.searchMarker) {
            this.searchMarker.setMap(null);
          }
          
          // Add marker for searched location
          this.searchMarker = new google.maps.Marker({
            position: location,
            map: this.map,
            title: results[0].formatted_address,
            animation: google.maps.Animation.DROP
          });
          
          // Show info window with address
          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="padding: 5px;"><b>${results[0].formatted_address}</b></div>`
          });
          infoWindow.open(this.map, this.searchMarker);
          
          // Update direction inputs with searched location
          if (!this.gmapStart.value.trim()) {
            this.gmapStart.value = results[0].formatted_address;
          } else if (!this.gmapEnd.value.trim()) {
            this.gmapEnd.value = results[0].formatted_address;
          }
        } else {
          let errorMessage = 'Location not found';
          if (status === 'ZERO_RESULTS') {
            errorMessage = 'No results found for "' + query + '". Try a more specific search.';
          } else if (status === 'OVER_QUERY_LIMIT') {
            errorMessage = 'Search quota exceeded. Please try again later.';
          } else if (status === 'REQUEST_DENIED') {
            errorMessage = 'Search request denied. Check API key permissions.';
          }
          alert(errorMessage);
        }
      } finally {
        // Restore button state
        this.gmapSearchBtn.disabled = false;
        try { this.gmapSearchBtn.innerHTML = prevBtnHtml; } catch (e) { /* ignore */ }
      }
    });
  }

  private clearMap(): void {
    // When no API key is configured, Google objects are missing—just reset inputs/panel.
    if (!this.hasApiKey || !this.map || !this.googleMapsLoaded) {
      this.gmapSearchInput.value = '';
      this.gmapStart.value = '';
      this.gmapEnd.value = '';
      this.directionsPanel.classList.remove('visible');
      return;
    }

    // Reset to default center (Wrocław, Poland)
    const defaultCenter = { lat: 51.109935, lng: 17.031770 };
    this.map.setCenter(defaultCenter);
    this.map.setZoom(13);
    
    // Remove search marker if exists
    if (this.searchMarker) {
      this.searchMarker.setMap(null);
      this.searchMarker = null;
    }
    
    // Remove start/end markers
    if (this.startMarker) {
      this.startMarker.setMap(null);
      this.startMarker = null;
    }
    if (this.endMarker) {
      this.endMarker.setMap(null);
      this.endMarker = null;
    }
    
    // Close any open info windows
    if (this.currentInfoWindow) {
      this.currentInfoWindow.close();
      this.currentInfoWindow = null;
    }
    
    // Clear search input
    this.gmapSearchInput.value = '';
    
    // Clear direction inputs
    this.gmapStart.value = '';
    this.gmapEnd.value = '';
    
    // Hide directions panel
    this.directionsPanel.classList.remove('visible');
    
    // Clear directions from renderer
    if (this.directionsRenderer) {
      this.directionsRenderer.setDirections({ routes: [] });
    }
  }

  private saveApiKey(): void {
    const apiKey = this.gmapApiKeyInput.value.trim();
    
    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    // Don't save if it's already masked (user didn't change it)
    if (apiKey.includes('...')) {
      this.updateApiKeyStatus('ℹ️ API key already saved', 'success');
      return;
    }

    try {
      localStorage.setItem('googleMapsApiKey', apiKey);
      this.apiKey = apiKey;
      this.gmapApiKeyInput.value = this.maskApiKey(apiKey);
      this.updateApiKeyStatus('✅ API Key saved! Reloading map...', 'success');
      
      // Reload the page to load Google Maps with new key
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to save API key:', error);
      this.updateApiKeyStatus('❌ Failed to save API key', 'error');
      alert('Failed to save API key. Please try again.');
    }
  }

  private removeApiKey(): void {
    if (!confirm('Are you sure you want to remove the saved API key?')) {
      return;
    }

    try {
      localStorage.removeItem('googleMapsApiKey');
      this.apiKey = '';
      this.gmapApiKeyInput.value = '';
      this.updateApiKeyStatus('✅ API Key removed! Page will reload.', 'success');
      this.updateStatusLights(false);
      
      setTimeout(() => {
        location.reload();
      }, 1500);
    } catch (error) {
      console.error('Failed to remove API key:', error);
      this.updateApiKeyStatus('❌ Failed to remove API key', 'error');
    }
  }

  private loadCollapsedStates(): void {
    try {
      const apiKeyState = localStorage.getItem('gmapApiKeyExpanded');
      const directionsState = localStorage.getItem('gmapDirectionsExpanded');
      
      this.apiKeyExpanded = apiKeyState ? JSON.parse(apiKeyState) : false;
      this.directionsExpanded = directionsState ? JSON.parse(directionsState) : true;
      
      this.updateSectionUI(this.apiKeyContent, this.toggleApiKeyBtn, this.apiKeyExpanded);
      this.updateSectionUI(this.directionsContent, this.toggleDirectionsBtn, this.directionsExpanded);
    } catch (error) {
      console.error('Failed to load collapsed states:', error);
    }
  }

  private saveCollapsedStates(): void {
    try {
      localStorage.setItem('gmapApiKeyExpanded', JSON.stringify(this.apiKeyExpanded));
      localStorage.setItem('gmapDirectionsExpanded', JSON.stringify(this.directionsExpanded));
    } catch (error) {
      console.error('Failed to save collapsed states:', error);
    }
  }

  private toggleApiKeySection(): void {
    this.apiKeyExpanded = !this.apiKeyExpanded;
    this.updateSectionUI(this.apiKeyContent, this.toggleApiKeyBtn, this.apiKeyExpanded);
    this.saveCollapsedStates();
  }

  private toggleDirectionsSection(): void {
    this.directionsExpanded = !this.directionsExpanded;
    this.updateSectionUI(this.directionsContent, this.toggleDirectionsBtn, this.directionsExpanded);
    this.saveCollapsedStates();
  }

  private updateSectionUI(content: HTMLElement, button: HTMLButtonElement, isExpanded: boolean): void {
    const icon = button.querySelector('.toggle-icon');
    if (isExpanded) {
      content.style.display = 'block';
      if (icon) icon.textContent = '▼';
    } else {
      content.style.display = 'none';
      if (icon) icon.textContent = '▶';
    }
  }

  private updateStatusLights(hasApiKey: boolean): void {
    if (hasApiKey) {
      this.gmapsTabStatusLight.classList.add('ready');
      this.apiKeyStatusLight.classList.add('ready');
    } else {
      this.gmapsTabStatusLight.classList.remove('ready');
      this.apiKeyStatusLight.classList.remove('ready');
    }
  }
}

class ScriptExecutor {
  private scriptInput: HTMLTextAreaElement;
  private runBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private scriptOutput: HTMLDivElement;
  private executionTime: HTMLSpanElement;
  private isRunning = false;
  private currentProcess: any = null;
  private commandHistory: Array<{command: string, output: string, isError: boolean, duration: string}> = [];
  private killTimer: NodeJS.Timeout | null = null;
  private wasStopped = false;
  private timedOut = false;
  private readonly timeoutMs = 30000;
  private readonly maxOutputChars = 50000;

  constructor() {
    this.scriptInput = document.getElementById('scriptInput') as HTMLTextAreaElement;
    this.runBtn = document.getElementById('runScriptBtn') as HTMLButtonElement;
    this.stopBtn = document.getElementById('stopScriptBtn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('clearOutputBtn') as HTMLButtonElement;
    this.scriptOutput = document.getElementById('scriptOutput') as HTMLDivElement;
    this.executionTime = document.getElementById('executionTime') as HTMLSpanElement;

    this.setupEventListeners();
  }

  private appendLines(container: HTMLElement, data: string, className: string): number {
    let added = 0;
    data.split(/\r?\n/).forEach(line => {
      if (!line) return;
      const div = document.createElement('div');
      div.className = `output-line ${className}`;
      div.textContent = line;
      container.appendChild(div);
      added += line.length;
    });
    this.scriptOutput.scrollTop = this.scriptOutput.scrollHeight;
    return added;
  }

  private appendMessage(container: HTMLElement, text: string, className: string): void {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    container.appendChild(div);
    this.scriptOutput.scrollTop = this.scriptOutput.scrollHeight;
  }

  private clearKillTimer(): void {
    if (this.killTimer) {
      clearTimeout(this.killTimer);
      this.killTimer = null;
    }
  }

  private setupEventListeners(): void {
    this.runBtn.addEventListener('click', () => this.runScript());
    this.stopBtn.addEventListener('click', () => this.stopScript());
    this.clearBtn.addEventListener('click', () => this.clearOutput());
    
    this.scriptInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.runScript();
      }
    });
    console.log('ScriptExecutor: Event listeners set up');
  }

  private clearOutput(): void {
    this.scriptOutput.innerHTML = '<div class="output-placeholder">Ready to execute scripts...</div>';
    this.executionTime.textContent = '';
    this.commandHistory = [];
  }

  private async runScript(): Promise<void> {
    const script = this.scriptInput.value.trim();
    if (!script || this.isRunning) return;

    // Block privileged commands for safety
    if (/\bsudo\b/i.test(script)) {
      if (this.scriptOutput.querySelector('.output-placeholder')) {
        this.scriptOutput.innerHTML = '';
      }
      const commandDiv = document.createElement('div');
      commandDiv.className = 'output-command';
      commandDiv.textContent = `$ ${script}`;
      this.scriptOutput.appendChild(commandDiv);

      const outputDiv = document.createElement('div');
      outputDiv.className = 'output-block';
      this.appendMessage(outputDiv, '✗ sudo is blocked in this app', 'output-error');
      this.scriptOutput.appendChild(outputDiv);
      this.commandHistory.push({ command: script, output: outputDiv.innerHTML, isError: true, duration: '0.00' });
      this.executionTime.textContent = '';
      return;
    }

    this.isRunning = true;
    this.wasStopped = false;
    this.timedOut = false;
    this.runBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.runBtn.innerHTML = '<span class="spinner"></span>Running...';

    const startTime = Date.now();
    let isError = false;
    let duration = '';
    let outputChars = 0;

    // Remove placeholder if present
    if (this.scriptOutput.querySelector('.output-placeholder')) {
      this.scriptOutput.innerHTML = '';
    }

    const commandDiv = document.createElement('div');
    commandDiv.className = 'output-command';
    commandDiv.textContent = `$ ${script}`;
    this.scriptOutput.appendChild(commandDiv);

    const outputDiv = document.createElement('div');
    outputDiv.className = 'output-block';
    this.scriptOutput.appendChild(outputDiv);

    try {
      const { spawn } = require('child_process');
      this.currentProcess = spawn('/bin/zsh', ['-c', script]);

      this.killTimer = setTimeout(() => {
        this.timedOut = true;
        if (this.currentProcess) {
          this.currentProcess.kill('SIGTERM');
        }
      }, this.timeoutMs);

      this.currentProcess.stdout.on('data', (data: Buffer) => {
        if (outputChars > this.maxOutputChars || this.timedOut || this.wasStopped) return;
        outputChars += this.appendLines(outputDiv, data.toString(), 'output-stdout');
        if (outputChars > this.maxOutputChars) {
          this.appendMessage(outputDiv, '⏹️ Output truncated (too large)', 'output-error');
          this.wasStopped = true;
          if (this.currentProcess) this.currentProcess.kill('SIGTERM');
        }
      });

      this.currentProcess.stderr.on('data', (data: Buffer) => {
        if (outputChars > this.maxOutputChars || this.timedOut || this.wasStopped) return;
        outputChars += this.appendLines(outputDiv, data.toString(), 'output-stderr');
        if (outputChars > this.maxOutputChars) {
          this.appendMessage(outputDiv, '⏹️ Output truncated (too large)', 'output-error');
          this.wasStopped = true;
          if (this.currentProcess) this.currentProcess.kill('SIGTERM');
        }
      });

      const result: { code: number | null; signal: NodeJS.Signals | null } = await new Promise((resolve, reject) => {
        this.currentProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          resolve({ code, signal });
        });
        this.currentProcess.on('error', (err: Error) => {
          reject(err);
        });
      });

      const endTime = Date.now();
      duration = ((endTime - startTime) / 1000).toFixed(2);
      const durationText = this.timedOut ? `Execution time: ${duration}s (timeout)` : this.wasStopped ? `Execution time: ${duration}s (stopped)` : `Execution time: ${duration}s`;
      this.executionTime.textContent = durationText;

      if (this.timedOut) {
        isError = true;
        this.appendMessage(outputDiv, `✗ Timed out after ${Math.round(this.timeoutMs / 1000)}s`, 'output-error');
      } else if (this.wasStopped) {
        isError = true;
        this.appendMessage(outputDiv, '⏹️ Execution stopped by user', 'output-error');
      } else if (result.code === 0 || result.code === null) {
        this.appendMessage(outputDiv, '✓ Completed successfully', 'output-success');
      } else {
        isError = true;
        this.appendMessage(outputDiv, `✗ Error: exited with code ${result.code}`, 'output-error');
      }
    } catch (error: any) {
      const endTime = Date.now();
      duration = ((endTime - startTime) / 1000).toFixed(2);
      isError = true;
      this.executionTime.textContent = `Execution time: ${duration}s (failed)`;
      this.appendMessage(outputDiv, `✗ Error: ${error.message || error}`, 'output-error');
    } finally {
      this.clearKillTimer();
      this.commandHistory.push({ command: script, output: outputDiv.innerHTML, isError, duration });
      this.isRunning = false;
      this.runBtn.disabled = false;
      this.stopBtn.disabled = true;
      this.currentProcess = null;
      this.runBtn.innerHTML = '▶ Run';
    }
  }

  private stopScript(): void {
    if (this.currentProcess && this.isRunning) {
      this.wasStopped = true;
      this.stopBtn.disabled = true;
      this.currentProcess.kill('SIGTERM');
    }
  }
}

// Helper function to extract location from user's question using simple rules
function extractLocationFromQuestion(question: string): { type: 'coordinates' | 'place', lat?: number, lon?: number, placeName?: string } | null {
  // Rule 1: Check for coordinates in the question
  const coordPatterns = [
    /(-?\d+\.\d+)\s*[,°]?\s*[-]?\s*([NS])?\s*[,;]?\s*(-?\d+\.\d+)\s*[,°]?\s*[-]?\s*([EW])?/gi,
    /(?:lat(?:itude)?|coords?)\s*[:=]?\s*(-?\d+\.\d+).*?(?:lon(?:gitude)?|lng)\s*[:=]?\s*(-?\d+\.\d+)/gi,
    /(?:coordinates?|coords?)\s*[:=]?\s*\(?\s*(-?\d+\.\d+)\s*[,;]\s*(-?\d+\.\d+)\s*\)?/gi
  ];

  for (const pattern of coordPatterns) {
    const match = pattern.exec(question);
    if (match) {
      let lat: number, lon: number;
      
      if (match.length >= 5) {
        lat = parseFloat(match[1]) * (match[2] === 'S' ? -1 : 1);
        lon = parseFloat(match[3]) * (match[4] === 'W' ? -1 : 1);
      } else {
        lat = parseFloat(match[1]);
        lon = parseFloat(match[2]);
      }

      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        console.log(`Location extracted (coordinates): ${lat}, ${lon}`);
        return { type: 'coordinates', lat, lon };
      }
    }
  }

  // Rule 2: "what is location of X" or "what is X location"
  let match = question.match(/what\s+is\s+(?:the\s+)?location\s+of\s+(.+?)(?:\?|$)/i);
  if (match) {
    const placeName = match[1].trim();
    console.log(`Location extracted (location of): ${placeName}`);
    return { type: 'place', placeName };
  }

  match = question.match(/what\s+is\s+(.+?)\s+location(?:\?|$)/i);
  if (match) {
    const placeName = match[1].trim();
    console.log(`Location extracted (X location): ${placeName}`);
    return { type: 'place', placeName };
  }

  // Rule 3: "where is X"
  match = question.match(/where\s+is\s+(.+?)(?:\?|$)/i);
  if (match) {
    const placeName = match[1].trim();
    console.log(`Location extracted (where is): ${placeName}`);
    return { type: 'place', placeName };
  }

  // Rule 4: "what to do/see in X" or "what can I do in X" or "what is worth to see in X"
  match = question.match(/what\s+(?:can\s+I\s+)?(?:to\s+)?(?:do|see|visit|explore)\s+in\s+(.+?)(?:\?|$)/i);
  if (match) {
    const placeName = match[1].trim();
    console.log(`Location extracted (what to do in): ${placeName}`);
    return { type: 'place', placeName };
  }

  match = question.match(/what\s+is\s+worth\s+to\s+see\s+in\s+(.+?)(?:\?|$)/i);
  if (match) {
    const placeName = match[1].trim();
    console.log(`Location extracted (worth to see in): ${placeName}`);
    return { type: 'place', placeName };
  }

  // Rule 5: "tell me about X" (where X looks like a place)
  match = question.match(/tell\s+me\s+about\s+(.+?)(?:\?|$)/i);
  if (match) {
    const text = match[1].trim();
    // Only if it contains typical place patterns (capitalized, has "city", comma-separated)
    if (/(?:city|town|village|country),?\s*/i.test(text) || /^[A-ZÀ-ÿ][a-zà-ÿ]+(?:,\s+[A-ZÀ-ÿ][a-zà-ÿ]+)?$/.test(text)) {
      console.log(`Location extracted (tell me about): ${text}`);
      return { type: 'place', placeName: text };
    }
  }

  // Rule 6: Simple format "city X", "village X", "region X", "lake X", "river X", etc.
  match = question.match(/^(?:city|town|village|region|country|state|province|island|mountain|mount|mt|volcano|lake|river|ocean|sea|bay|peninsula|desert|forest|valley|canyon|park|trail|beach|harbor|port|airport|coordinates?)\s+(?:for\s+|of\s+)?(.+?)(?:\?|$)/i);
  if (match) {
    const placeName = match[1].trim();
    console.log(`Location extracted (simple format): ${placeName}`);
    return { type: 'place', placeName };
  }

  console.log('No location extracted from question');
  return null;
}

class OwrapApp {
    // Redraws the chat log from the current session's messages
    private renderMessages(): void {
      const session = this.sessions.get(this.currentSessionId);
      if (!session) return;
      
      this.chatLog.innerHTML = '';
      for (let i = 0; i < session.messages.length; i++) {
        const msg = session.messages[i];
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${msg.role}`;
        messageDiv.innerHTML = this.formatMarkdown(msg.content);
        // Add copy button for assistant replies
        if (msg.role === 'assistant') {
          // Create wrapper to place button outside the message
          const wrapper = document.createElement('div');
          wrapper.className = 'chat-message-wrapper';
          
          const copyBtn = document.createElement('button');
          copyBtn.className = 'copy-reply-btn';
          copyBtn.textContent = '📋';
          copyBtn.title = 'Copy reply';
          copyBtn.onclick = () => {
            // Remove HTML tags and decode entities for copying plain text
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.formatMarkdown(msg.content);
            const text = tempDiv.textContent || tempDiv.innerText || '';
            navigator.clipboard.writeText(text);
            copyBtn.textContent = '✅';
            setTimeout(() => { copyBtn.textContent = '📋'; }, 1200);
          };
          
          // Add message and button to wrapper
          wrapper.appendChild(messageDiv);
          wrapper.appendChild(copyBtn);

          // Extract location from the previous user message (if exists)
          let locationData = null;
          if (i > 0) {
            const prevMsg = session.messages[i - 1];
            if (prevMsg.role === 'user') {
              locationData = extractLocationFromQuestion(prevMsg.content);
            }
          }
          
          // If location was found in user's question, add map button
          if (locationData && globalMapApp) {
            const mapBtn = document.createElement('button');
            mapBtn.className = 'goto-map-btn';
            mapBtn.textContent = '🗺️';
            mapBtn.title = 'Go to map';
            mapBtn.onclick = () => {
              console.log('Map button clicked, locationData:', locationData);
              if (locationData.type === 'coordinates' && locationData.lat !== undefined && locationData.lon !== undefined) {
                console.log(`Navigating to coordinates: ${locationData.lat}, ${locationData.lon}`);
                globalMapApp!.navigateToLocation(locationData.lat, locationData.lon);
              } else if (locationData.type === 'place' && locationData.placeName) {
                console.log(`Navigating to place: ${locationData.placeName}`);
                globalMapApp!.navigateToPlace(locationData.placeName);
              }
            };
            wrapper.appendChild(mapBtn);
          }
          
          // Add timing info if available (not included in copy)
          if (msg.duration !== undefined) {
            const timingDiv = document.createElement('div');
            timingDiv.className = 'message-timing';
            timingDiv.textContent = `⏱️ ${msg.duration.toFixed(2)}s`;
            timingDiv.style.cssText = `
              font-size: 11px;
              color: var(--text-secondary, #888);
              margin-top: 4px;
              font-style: italic;
            `;
            wrapper.appendChild(timingDiv);
          }
          
          this.chatLog.appendChild(wrapper);
        } else {
          this.chatLog.appendChild(messageDiv);
        }
      }
      this.chatLog.scrollTop = this.chatLog.scrollHeight;
    }
  private ollamaUrl: string = 'http://localhost:11434';
  private ollamaUrlInput: HTMLInputElement | null = null;
  private refreshOllamaStatusBtn: HTMLButtonElement | null = null;
  private model: string = 'wizardlm2:7b';
  private temperature: number = 0.7;
  private statusLight: HTMLElement;
  private statusText: HTMLElement;
  private currentModelDisplay: HTMLElement;
  private modelSelect: HTMLSelectElement;
  private temperatureSlider: HTMLInputElement | null = null;
  private temperatureInput: HTMLInputElement | null = null;
  private refreshModelsBtn: HTMLButtonElement;
  private promptSelect: HTMLSelectElement;
  private showPromptBtn: HTMLButtonElement;
  private chatLog: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private infoBtn: HTMLButtonElement;
  private focusModeBtn: HTMLButtonElement;
  private fitBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private loadBtn: HTMLButtonElement;
  private newSessionBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private recentPromptsSelect: HTMLSelectElement;
  private clearRecentPromptsBtn: HTMLButtonElement;
  private toggleControlsBtn: HTMLButtonElement;
  private toggleOllamaServiceBtn: HTMLButtonElement;
  private toggleOllamaControlsBtn: HTMLButtonElement | null = null;
  private controlsContent: HTMLElement;
  private ollamaServiceContent: HTMLElement;
  private ollamaControlsContent: HTMLElement | null = null;
  private startOllamaBtn: HTMLButtonElement | null = null;
  private stopOllamaBtn: HTMLButtonElement | null = null;
  private ollamaLogEl: HTMLElement | null = null;
  private ollamaServiceStatusEl: HTMLElement | null = null;
  private ollamaServiceStatusLight: HTMLElement | null = null;
  private ollamaControlsStatusLight: HTMLElement | null = null;
  private owrapTabStatusEl: HTMLElement | null = null;
  private toggleSystemMonitorBtn: HTMLButtonElement | null = null;
  private systemMonitorContent: HTMLElement | null = null;
  private cpuUsageEl: HTMLElement | null = null;
  private cpuUserEl: HTMLElement | null = null;
  private cpuSystemEl: HTMLElement | null = null;
  private cpuIdleEl: HTMLElement | null = null;
  private ramUsageEl: HTMLElement | null = null;
  private ramUsedEl: HTMLElement | null = null;
  private ramFreeEl: HTMLElement | null = null;
  private ramTotalEl: HTMLElement | null = null;
  private cpuBarEl: HTMLElement | null = null;
  private ramBarEl: HTMLElement | null = null;
  private ollamaModelNameEl: HTMLElement | null = null;
  private ollamaModelIdEl: HTMLElement | null = null;
  private ollamaModelSizeEl: HTMLElement | null = null;
  private ollamaModelProcessorEl: HTMLElement | null = null;
  private ollamaModelContextEl: HTMLElement | null = null;
  private ollamaModelUntilEl: HTMLElement | null = null;
  private systemMonitorInterval: any = null;
  private sessionTabsBar: HTMLElement;
  private addSessionTabBtn: HTMLButtonElement;
  private ollamaProcess: any = null;
  private ollamaIsExternal: boolean = false;
  private loadingModels: boolean = false;
  private currentPrompt: string = '';
  private recentPrompts: string[] = [];
  private maxRecentPrompts: number = 20;
  private controlsExpanded: boolean = true;
  private clearNoticeTimeout: any = null;
  private defaultChatLogHeight: string = '';
  
  // Left panel
  private owrapLeftPanel: HTMLElement | null = null;
  private toggleOwrapPanelBtn: HTMLButtonElement | null = null;
  private toggleOwrapPanelFloatBtn: HTMLButtonElement | null = null;
  private resizeHandleLeft: HTMLElement | null = null;
  private isLeftPanelCollapsed: boolean = false;
  
  // Session management
  private sessions: Map<number, {
    sessionNumber: number;
    customName?: string;
    model: string;
    temperature: number;
    prompt: string;
    promptSelection: string;
    messages: Array<{role: string, content: string, timestamp?: number, duration?: number}>;
    autoSaveInterval: any;
    lastAutoSaveTime: number;
  }> = new Map();
  private currentSessionId: number = 1;
  private nextSessionNumber: number = 1;

  constructor() {
    this.statusLight = document.getElementById('owrapOllamaStatus') as HTMLElement;
    this.statusText = document.getElementById('owrapOllamaText') as HTMLElement;
    this.currentModelDisplay = document.getElementById('owrapCurrentModel') as HTMLElement;
    this.modelSelect = document.getElementById('owrapModelSelect') as HTMLSelectElement;
    this.temperatureSlider = document.getElementById('owrapTemperatureSlider') as HTMLInputElement | null;
    this.temperatureInput = document.getElementById('owrapTemperatureInput') as HTMLInputElement | null;
    this.refreshModelsBtn = document.getElementById('refreshModelsBtn') as HTMLButtonElement;
    this.promptSelect = document.getElementById('owrapPromptSelect') as HTMLSelectElement;
    this.showPromptBtn = document.getElementById('showSysPromptBtn') as HTMLButtonElement;
    this.chatLog = document.getElementById('owrapChatLog') as HTMLDivElement;
    this.input = document.getElementById('owrapInput') as HTMLTextAreaElement;
    this.sendBtn = document.getElementById('owrapSendBtn') as HTMLButtonElement;
    this.infoBtn = document.getElementById('owrapInfoBtn') as HTMLButtonElement;
    this.focusModeBtn = document.getElementById('owrapFocusModeBtn') as HTMLButtonElement;
    this.fitBtn = document.getElementById('owrapFitBtn') as HTMLButtonElement;
    this.saveBtn = document.getElementById('owrapSaveBtn') as HTMLButtonElement;
    this.loadBtn = document.getElementById('owrapLoadBtn') as HTMLButtonElement;
    this.newSessionBtn = document.getElementById('owrapNewSessionBtn') as HTMLButtonElement;
    this.clearBtn = document.getElementById('owrapClearBtn') as HTMLButtonElement;
    this.recentPromptsSelect = document.getElementById('recentPromptsSelect') as HTMLSelectElement;
    this.clearRecentPromptsBtn = document.getElementById('clearRecentPromptsBtn') as HTMLButtonElement;
    this.toggleControlsBtn = document.getElementById('toggleControlsBtn') as HTMLButtonElement;
    this.toggleOllamaServiceBtn = document.getElementById('toggleOllamaServiceBtn') as HTMLButtonElement;
    this.toggleOllamaControlsBtn = document.getElementById('toggleOllamaControlsBtn') as HTMLButtonElement | null;
    this.controlsContent = document.getElementById('controlsContent') as HTMLElement;
    this.ollamaServiceContent = document.getElementById('ollamaServiceContent') as HTMLElement;
    this.ollamaControlsContent = document.getElementById('ollamaControlsContent') as HTMLElement | null;
    this.ollamaUrlInput = document.getElementById('ollamaUrlInput') as HTMLInputElement | null;
    this.refreshOllamaStatusBtn = document.getElementById('refreshOllamaStatusBtn') as HTMLButtonElement | null;
    this.sessionTabsBar = document.getElementById('sessionTabsBar') as HTMLElement;
    this.addSessionTabBtn = document.getElementById('addSessionTabBtn') as HTMLButtonElement;
    this.startOllamaBtn = document.getElementById('startOllamaBtn') as HTMLButtonElement | null;
    this.stopOllamaBtn = document.getElementById('stopOllamaBtn') as HTMLButtonElement | null;
    this.ollamaLogEl = document.getElementById('ollamaLog') as HTMLElement | null;
    this.ollamaServiceStatusEl = document.getElementById('ollamaServiceStatus') as HTMLElement | null;
    this.ollamaServiceStatusLight = document.getElementById('ollamaServiceStatusLight') as HTMLElement | null;
    this.ollamaControlsStatusLight = document.getElementById('ollamaControlsStatusLight') as HTMLElement | null;
    this.owrapTabStatusEl = document.getElementById('owrapTabStatus') as HTMLElement | null;
    this.toggleSystemMonitorBtn = document.getElementById('toggleSystemMonitorBtn') as HTMLButtonElement | null;
    this.systemMonitorContent = document.getElementById('systemMonitorContent') as HTMLElement | null;
    this.cpuUsageEl = document.getElementById('cpuUsage') as HTMLElement | null;
    this.cpuUserEl = document.getElementById('cpuUser') as HTMLElement | null;
    this.cpuSystemEl = document.getElementById('cpuSystem') as HTMLElement | null;
    this.cpuIdleEl = document.getElementById('cpuIdle') as HTMLElement | null;
    this.ramUsageEl = document.getElementById('ramUsage') as HTMLElement | null;
    this.ramUsedEl = document.getElementById('ramUsed') as HTMLElement | null;
    this.ramFreeEl = document.getElementById('ramFree') as HTMLElement | null;
    this.ramTotalEl = document.getElementById('ramTotal') as HTMLElement | null;
    this.cpuBarEl = document.getElementById('cpuBar') as HTMLElement | null;
    this.ramBarEl = document.getElementById('ramBar') as HTMLElement | null;
    this.ollamaModelNameEl = document.getElementById('ollamaModelName') as HTMLElement | null;
    this.ollamaModelIdEl = document.getElementById('ollamaModelId') as HTMLElement | null;
    this.ollamaModelSizeEl = document.getElementById('ollamaModelSize') as HTMLElement | null;
    this.ollamaModelProcessorEl = document.getElementById('ollamaModelProcessor') as HTMLElement | null;
    this.ollamaModelContextEl = document.getElementById('ollamaModelContext') as HTMLElement | null;
    this.ollamaModelUntilEl = document.getElementById('ollamaModelUntil') as HTMLElement | null;

    // Initialize left panel elements
    this.owrapLeftPanel = document.getElementById('owrapLeftPanel') as HTMLElement | null;
    this.toggleOwrapPanelBtn = document.getElementById('toggleOwrapPanelBtn') as HTMLButtonElement | null;
    this.toggleOwrapPanelFloatBtn = document.getElementById('toggleOwrapPanelFloatBtn') as HTMLButtonElement | null;
    this.resizeHandleLeft = document.querySelector('.resize-handle-horizontal-left') as HTMLElement | null;

    this.loadControlsState();
    this.loadRecentPrompts();
    this.loadAvailableModels();
    this.loadPrompts();
    this.setTemperatureControls(this.temperature);
    this.setupEventListeners();
    this.checkOllamaStatus();
    
    // Set default chat log height to a reasonable initial size
    this.defaultChatLogHeight = '300px';
    
    // Create first session
    this.createNewSessionTab();
    // Ensure Ollama process stops when app/window is closed
    window.addEventListener('beforeunload', () => {
      try { 
        this.stopOllama(); 
        if (this.systemMonitorInterval) {
          clearInterval(this.systemMonitorInterval);
        }
      } catch (e) { /* ignore */ }
    });
    
    // Check status every 10 seconds
    setInterval(() => this.checkOllamaStatus(), 10000);
    
    // Start system monitoring
    this.startSystemMonitoring();
    
    console.log('OwrapApp: Initialized');
  }

  private async loadPrompts(): Promise<void> {
    try {
      // Get the prompts directory path
      const promptsDir = path.join(getAppPath(), 'prompts');
      
      // Read all files from prompts directory
      const files = await readdirAsync(promptsDir);
      const txtFiles = files.filter((f: string) => f.endsWith('.txt'));
      
      // Clear and populate select
      this.promptSelect.innerHTML = '';
      
      // Add default option
      const defaultOption = document.createElement('option');
      defaultOption.value = 'default';
      defaultOption.textContent = 'Default';
      this.promptSelect.appendChild(defaultOption);
      
      // Add prompts from files
      txtFiles.forEach((filename: string) => {
        const option = document.createElement('option');
        option.value = filename;
        option.textContent = filename.replace('.txt', '').replace(/_/g, ' ');
        this.promptSelect.appendChild(option);
      });

      // Set life_assistant.txt as default if it exists
      if (txtFiles.includes('life_assistant.txt')) {
        this.promptSelect.value = 'life_assistant.txt';
      }

      await this.loadSelectedPrompt();
    } catch (error: any) {
      console.error('Failed to load prompts:', error);
      // Fallback to default if directory doesn't exist
      this.currentPrompt = this.getDefaultPrompt();
    }
  }

  private getDefaultPrompt(): string {
    return `You are a helpful, general-purpose assistant.

Default behavior: answer the user's question.

Only when the user explicitly and strictly asks you to execute a shell command (e.g., "execute this command:", "run:", "run this command", "run the following"), respond ONLY as JSON:
{"action": "run_command", "command": "<shell command>"}

In all other cases, respond ONLY as JSON:
{"action": "answer", "text": "<your normal answer>"}

Never include backticks, comments, or extra keys.`;
  }

  private async loadPromptContent(promptFile: string): Promise<string> {
    if (promptFile === 'default') {
      return this.getDefaultPrompt();
    }
    
    try {
      const promptsDir = path.join(getAppPath(), 'prompts');
      const filePath = path.join(promptsDir, promptFile);
      const content = await readFileAsync(filePath, 'utf-8');
      return content.trim();
    } catch (error: any) {
      console.error('Failed to load prompt file:', error);
      return this.getDefaultPrompt();
    }
  }

  private async loadSelectedPrompt(): Promise<void> {
    const selected = this.promptSelect.value;
    let promptName = selected;
    if (selected === 'default') {
      this.currentPrompt = this.getDefaultPrompt();
      promptName = 'Default';
    } else {
      try {
        // Read the prompt file from prompts directory
        const promptsDir = path.join(getAppPath(), 'prompts');
        const filePath = path.join(promptsDir, selected);
        const content = await readFileAsync(filePath, 'utf-8');
        this.currentPrompt = content.trim();
      } catch (error: any) {
        console.error('Failed to load prompt file:', error);
        this.currentPrompt = this.getDefaultPrompt();
        promptName = 'Default';
        alert(`Failed to load prompt: ${selected}. Using default prompt.`);
      }
    }
    
    // Update current session's prompt
    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.prompt = this.currentPrompt;
      session.promptSelection = selected;
      
      // Remove previous system prompt change messages
      session.messages = session.messages.filter((m: any) => !(m.role === 'system' && m.content.startsWith('System prompt changed to: ')));
    }
    this.addMessage('system', `System prompt changed to: ${promptName}`);
    setTimeout(() => {
      if (session) {
        session.messages = session.messages.filter((m: any) => !(m.role === 'system' && (m.content.startsWith('System prompt changed to: ') || m.content === 'Chat cleared. Start a new conversation!')));
        this.renderMessages();
      }
    }, 2000);
  }

  private async loadAvailableModels(): Promise<void> {
    try {
      // Disable model select while loading
      try { if (this.modelSelect) this.modelSelect.disabled = true; } catch (e) {}
      const ollamaPath = getOllamaPath();
      const { stdout } = await execAsync(`${ollamaPath} ls`);
      const lines = stdout.trim().split('\n');
      
      // Skip header line and parse models
      const models: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          // Extract model name (first column)
          const modelName = line.split(/\s+/)[0];
          if (modelName) {
            models.push(modelName);
          }
        }
      }

      if (models.length > 0) {
        this.modelSelect.innerHTML = '';
        models.forEach(modelName => {
          const option = document.createElement('option');
          option.value = modelName;
          option.textContent = modelName;
          if (modelName === this.model) {
            option.selected = true;
          }
          this.modelSelect.appendChild(option);
        });
        try {
          // Ensure the select reflects the current model value
          this.modelSelect.value = this.model;
          this.currentModelDisplay.textContent = this.model;
          this.modelSelect.disabled = false;
          console.log('Loaded models:', models);
        } catch (e) {}
      }
    } catch (error: any) {
      console.error('Failed to load models:', error);
      // Keep default model in dropdown
      try { if (this.modelSelect) this.modelSelect.disabled = false; } catch (e) {}
    }
  }

  private setupEventListeners(): void {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.fitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Fit button clicked');
      this.fitChatLog();
    });
    this.saveBtn.addEventListener('click', () => this.saveChatHistory());
    this.focusModeBtn.addEventListener('click', () => this.toggleFocusMode());
    this.loadBtn.addEventListener('click', () => this.loadChatHistory());
    this.newSessionBtn.addEventListener('click', () => this.createNewSessionTab());
    this.clearBtn.addEventListener('click', () => {
      console.log('Clear Chat button clicked!');
      this.clearChat();
    });
    this.addSessionTabBtn.addEventListener('click', () => this.createNewSessionTab());
    this.showPromptBtn.addEventListener('click', () => this.showSystemPrompt());
    this.refreshModelsBtn.addEventListener('click', () => this.loadAvailableModels());
    this.promptSelect.addEventListener('change', () => this.loadSelectedPrompt());
    this.modelSelect.addEventListener('change', () => this.updateModel());
    // Defensive: stop propagation on click to avoid parent handlers intercepting
    this.modelSelect.addEventListener('click', (e) => { e.stopPropagation(); });
    if (this.temperatureSlider) {
      this.temperatureSlider.addEventListener('input', () => this.handleTemperatureInput(this.temperatureSlider!.value));
    }
    if (this.temperatureInput) {
      const applyTempChange = () => this.handleTemperatureInput(this.temperatureInput!.value);
      this.temperatureInput.addEventListener('change', applyTempChange);
      this.temperatureInput.addEventListener('blur', applyTempChange);
      this.temperatureInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyTempChange();
          this.temperatureInput!.blur();
        }
      });
    }
    this.recentPromptsSelect.addEventListener('change', () => this.loadRecentPrompt());
    if (this.clearRecentPromptsBtn) {
      this.clearRecentPromptsBtn.addEventListener('click', () => this.clearRecentPrompts());
    }
    if (this.startOllamaBtn) this.startOllamaBtn.addEventListener('click', () => this.startOllama());
    if (this.stopOllamaBtn) this.stopOllamaBtn.addEventListener('click', () => this.stopOllama());
    if (this.ollamaUrlInput) {
      this.ollamaUrlInput.addEventListener('change', () => this.updateOllamaUrl());
      this.ollamaUrlInput.addEventListener('blur', () => this.updateOllamaUrl());
      this.ollamaUrlInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          this.updateOllamaUrl();
        }
      });
    }
    if (this.refreshOllamaStatusBtn) {
      this.refreshOllamaStatusBtn.addEventListener('click', () => {
        this.updateOllamaUrl();
        this.checkOllamaStatus();
      });
    }
    const temperatureInfoBtn = document.getElementById('temperatureInfoBtn');
    const temperatureInfoModal = document.getElementById('temperatureInfoModal');
    const closeTemperatureInfoModal = document.getElementById('closeTemperatureInfoModal');
    if (temperatureInfoBtn && temperatureInfoModal) {
      temperatureInfoBtn.addEventListener('click', () => {
        temperatureInfoModal.classList.add('show');
      });
    }
    if (closeTemperatureInfoModal && temperatureInfoModal) {
      closeTemperatureInfoModal.addEventListener('click', () => {
        temperatureInfoModal.classList.remove('show');
      });
      temperatureInfoModal.addEventListener('click', (e) => {
        if (e.target === temperatureInfoModal) {
          temperatureInfoModal.classList.remove('show');
        }
      });
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && temperatureInfoModal.classList.contains('show')) {
          temperatureInfoModal.classList.remove('show');
        }
      });
    }
    this.toggleControlsBtn.addEventListener('click', () => this.toggleControls());
    this.toggleOllamaServiceBtn.addEventListener('click', () => this.toggleOllamaService());
    if (this.toggleOllamaControlsBtn) {
      this.toggleOllamaControlsBtn.addEventListener('click', () => this.toggleOllamaControls());
    }
    if (this.toggleSystemMonitorBtn) {
      this.toggleSystemMonitorBtn.addEventListener('click', () => this.toggleSystemMonitor());
    }
    
    // Model info modal
    const modelInfoBtn = document.getElementById('modelInfoBtn');
    const modelInfoModal = document.getElementById('modelInfoModal');
    const closeModelInfoModal = document.getElementById('closeModelInfoModal');
    
    if (modelInfoBtn && modelInfoModal) {
      modelInfoBtn.addEventListener('click', () => {
        modelInfoModal.classList.add('show');
        // Update pull button states when modal opens
        this.updateModelPullButtons();
      });
    }
    
    if (closeModelInfoModal && modelInfoModal) {
      closeModelInfoModal.addEventListener('click', () => {
        modelInfoModal.classList.remove('show');
      });
      
      // Close modal when clicking outside
      modelInfoModal.addEventListener('click', (e) => {
        if (e.target === modelInfoModal) {
          modelInfoModal.classList.remove('show');
        }
      });
      
      // Close modal on Escape key
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && modelInfoModal.classList.contains('show')) {
          modelInfoModal.classList.remove('show');
        }
      });
    }
    
    // Model pull buttons
    const modelPullBtns = document.querySelectorAll('.model-pull-btn');
    modelPullBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const button = e.target as HTMLButtonElement;
        const modelName = button.getAttribute('data-model');
        if (modelName) {
          await this.pullModel(button, modelName);
        }
      });
    });
    
    // Buttons help modal
    const buttonsHelpModal = document.getElementById('buttonsHelpModal');
    const closeButtonsHelpModal = document.getElementById('closeButtonsHelpModal');
    
    if (this.infoBtn && buttonsHelpModal) {
      this.infoBtn.addEventListener('click', () => {
        buttonsHelpModal.classList.add('show');
      });
    }
    
    if (closeButtonsHelpModal && buttonsHelpModal) {
      closeButtonsHelpModal.addEventListener('click', () => {
        buttonsHelpModal.classList.remove('show');
      });
      
      // Close modal when clicking outside
      buttonsHelpModal.addEventListener('click', (e) => {
        if (e.target === buttonsHelpModal) {
          buttonsHelpModal.classList.remove('show');
        }
      });
      
      // Close modal on Escape key
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && buttonsHelpModal.classList.contains('show')) {
          buttonsHelpModal.classList.remove('show');
        }
      });
    }
    
    // Ollama URL info modal
    const ollamaUrlInfoBtn = document.getElementById('ollamaUrlInfoBtn');
    const ollamaUrlInfoModal = document.getElementById('ollamaUrlInfoModal');
    const closeOllamaUrlInfoModal = document.getElementById('closeOllamaUrlInfoModal');
    
    if (ollamaUrlInfoBtn && ollamaUrlInfoModal) {
      ollamaUrlInfoBtn.addEventListener('click', () => {
        ollamaUrlInfoModal.classList.add('show');
      });
    }
    
    if (closeOllamaUrlInfoModal && ollamaUrlInfoModal) {
      closeOllamaUrlInfoModal.addEventListener('click', () => {
        ollamaUrlInfoModal.classList.remove('show');
      });
      
      // Close modal when clicking outside
      ollamaUrlInfoModal.addEventListener('click', (e) => {
        if (e.target === ollamaUrlInfoModal) {
          ollamaUrlInfoModal.classList.remove('show');
        }
      });
      
      // Close modal on Escape key
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && ollamaUrlInfoModal.classList.contains('show')) {
          ollamaUrlInfoModal.classList.remove('show');
        }
      });
    }

    // Ollama service info modal
    const ollamaServiceInfoBtn = document.getElementById('ollamaServiceInfoBtn');
    const ollamaServiceInfoModal = document.getElementById('ollamaServiceInfoModal');
    const closeOllamaServiceInfoModal = document.getElementById('closeOllamaServiceInfoModal');
    
    if (ollamaServiceInfoBtn && ollamaServiceInfoModal) {
      ollamaServiceInfoBtn.addEventListener('click', () => {
        ollamaServiceInfoModal.classList.add('show');
      });
    }
    
    if (closeOllamaServiceInfoModal && ollamaServiceInfoModal) {
      closeOllamaServiceInfoModal.addEventListener('click', () => {
        ollamaServiceInfoModal.classList.remove('show');
      });
      
      // Close modal when clicking outside
      ollamaServiceInfoModal.addEventListener('click', (e) => {
        if (e.target === ollamaServiceInfoModal) {
          ollamaServiceInfoModal.classList.remove('show');
        }
      });
      
      // Close modal on Escape key
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && ollamaServiceInfoModal.classList.contains('show')) {
          ollamaServiceInfoModal.classList.remove('show');
        }
      });
    }
    
    // Left panel toggle
    if (this.toggleOwrapPanelBtn) {
      this.toggleOwrapPanelBtn.addEventListener('click', () => this.toggleLeftPanel());
    }
    if (this.toggleOwrapPanelFloatBtn) {
      this.toggleOwrapPanelFloatBtn.addEventListener('click', () => this.toggleLeftPanel());
    }
    
    // Left panel resize
    if (this.resizeHandleLeft && this.owrapLeftPanel) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 0;
      
      this.resizeHandleLeft.addEventListener('mousedown', (e: MouseEvent) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = this.owrapLeftPanel!.offsetWidth;
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
        
        const handleMouseMove = (e: MouseEvent) => {
          if (!isResizing) return;
          const deltaX = e.clientX - startX;
          const newWidth = startWidth + deltaX;
          if (newWidth >= 200 && newWidth <= 500) {
            this.owrapLeftPanel!.style.width = `${newWidth}px`;
          }
        };
        
        const handleMouseUp = () => {
          isResizing = false;
          document.body.style.cursor = '';
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      });
    }
    
    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
      // Cmd+Enter, Ctrl+Enter, or Shift+Enter will insert new line (default behavior when not prevented)
    });
    
    console.log('OwrapApp: Event listeners set up');
  }

  private updateModel(): void {
    this.model = this.modelSelect.value;
    console.log('Model selected:', this.model);
    this.currentModelDisplay.textContent = this.model;
    
    // Update current session's model
    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.model = this.model;
      
      // Remove previous model change messages and any 'Chat cleared' notice
      session.messages = session.messages.filter((m: any) => !(m.role === 'system' && (m.content.startsWith('Model changed to: ') || m.content === 'Chat cleared. Start a new conversation!')));
    }
    this.addMessage('system', `Model changed to: ${this.model}`);
    setTimeout(() => {
      if (session) {
        session.messages = session.messages.filter((m: any) => !(m.role === 'system' && (m.content.startsWith('Model changed to: ') || m.content === 'Chat cleared. Start a new conversation!')));
        this.renderMessages();
      }
    }, 2000);
  }

  private handleTemperatureInput(rawValue: string): void {
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed)) {
      this.setTemperatureControls(this.temperature);
      return;
    }
    this.updateTemperature(parsed);
  }

  private updateTemperature(value: number): void {
    const normalized = this.clampTemperature(value);
    this.temperature = normalized;
    this.setTemperatureControls(normalized);

    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.temperature = normalized;
    }
  }

  private clampTemperature(value: number): number {
    if (!Number.isFinite(value)) return 0.7;
    return Math.min(1, Math.max(0, value));
  }

  private setTemperatureControls(value: number): void {
    const formatted = this.clampTemperature(value).toFixed(2);
    if (this.temperatureSlider) {
      this.temperatureSlider.value = formatted;
    }
    if (this.temperatureInput) {
      this.temperatureInput.value = formatted;
    }
  }

  private loadRecentPrompts(): void {
    try {
      const stored = localStorage.getItem('owrapRecentPrompts');
      if (stored) {
        this.recentPrompts = JSON.parse(stored);
        this.updateRecentPromptsUI();
      }
    } catch (error) {
      console.error('Failed to load recent prompts:', error);
    }
  }

  private saveRecentPrompts(): void {
    try {
      localStorage.setItem('owrapRecentPrompts', JSON.stringify(this.recentPrompts));
    } catch (error) {
      console.error('Failed to save recent prompts:', error);
    }
  }

  private addToRecentPrompts(prompt: string): void {
    // Remove if already exists
    this.recentPrompts = this.recentPrompts.filter(p => p !== prompt);
    
    // Add to beginning
    this.recentPrompts.unshift(prompt);
    
    // Keep only max number
    if (this.recentPrompts.length > this.maxRecentPrompts) {
      this.recentPrompts = this.recentPrompts.slice(0, this.maxRecentPrompts);
    }
    
    this.saveRecentPrompts();
    this.updateRecentPromptsUI();
  }

  private updateRecentPromptsUI(): void {
    // Clear existing options except the first one
    this.recentPromptsSelect.innerHTML = '<option value="">-- Select a recent prompt --</option>';
    
    // Add recent prompts
    this.recentPrompts.forEach((prompt) => {
      const option = document.createElement('option');
      option.value = prompt;
      // Show truncated version in dropdown
      const truncated = prompt.length > 60 ? prompt.substring(0, 60) + '...' : prompt;
      option.textContent = truncated;
      this.recentPromptsSelect.appendChild(option);
    });
  }

  private clearRecentPrompts(): void {
    this.recentPrompts = [];
    try {
      localStorage.removeItem('owrapRecentPrompts');
    } catch (err) {
      console.error('Failed to clear recent prompts from localStorage:', err);
    }
    this.updateRecentPromptsUI();
    console.log('Recent prompts cleared.');
  }

  private loadRecentPrompt(): void {
    const selected = this.recentPromptsSelect.value;
    if (selected) {
      this.input.value = selected;
      this.input.focus();
      // Reset dropdown to default
      this.recentPromptsSelect.value = '';
    }
  }

  private loadControlsState(): void {
    try {
      const stored = localStorage.getItem('owrapControlsExpanded');
      if (stored !== null) {
        this.controlsExpanded = JSON.parse(stored);
        this.updateControlsUI();
      }
    } catch (error) {
      console.error('Failed to load controls state:', error);
    }
  }

  private saveControlsState(): void {
    try {
      localStorage.setItem('owrapControlsExpanded', JSON.stringify(this.controlsExpanded));
    } catch (error) {
      console.error('Failed to save controls state:', error);
    }
  }

  private updateOllamaUrl(): void {
    if (!this.ollamaUrlInput) return;
    
    let url = this.ollamaUrlInput.value.trim();
    if (!url) {
      url = 'http://localhost:11434';
      this.ollamaUrlInput.value = url;
    }
    
    // Handle URLs starting with just a port (e.g., ":11434")
    if (url.startsWith(':')) {
      url = 'http://localhost' + url;
      this.ollamaUrlInput.value = url;
    }
    // Ensure URL has protocol
    else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
      this.ollamaUrlInput.value = url;
    }
    
    this.ollamaUrl = url;
    
    // Immediately reset status to "Checking..." when URL changes
    this.statusLight.classList.remove('ready', 'not-ready');
    this.statusText.textContent = 'Checking...';
    this.statusText.style.color = '';
    this.loadingModels = false;
    
    console.log('Ollama URL updated to:', url);
    
    // Recheck status with new URL
    this.checkOllamaStatus();
  }

  private toggleControls(): void {
    this.controlsExpanded = !this.controlsExpanded;
    this.updateControlsUI();
    this.saveControlsState();
  }

  private updateControlsUI(): void {
    const icon = this.toggleControlsBtn.querySelector('.toggle-icon');
    if (this.controlsExpanded) {
      this.controlsContent.style.display = 'block';
      if (icon) icon.textContent = '▼'; // ▼
    } else {
      this.controlsContent.style.display = 'none';
      if (icon) icon.textContent = '▶'; // ▶
    }
  }

  private toggleOllamaService(): void {
    const icon = this.toggleOllamaServiceBtn.querySelector('.toggle-ollama-icon');
    if (this.ollamaServiceContent.style.display === 'none') {
      this.ollamaServiceContent.style.display = 'block';
      if (icon) icon.textContent = '▼';
    } else {
      this.ollamaServiceContent.style.display = 'none';
      if (icon) icon.textContent = '▶';
    }
  }

  private toggleOllamaControls(): void {
    if (!this.toggleOllamaControlsBtn || !this.ollamaControlsContent) return;
    
    const icon = this.toggleOllamaControlsBtn.querySelector('.toggle-ollama-controls-icon');
    if (this.ollamaControlsContent.style.display === 'none') {
      this.ollamaControlsContent.style.display = 'block';
      if (icon) icon.textContent = '▼';
    } else {
      this.ollamaControlsContent.style.display = 'none';
      if (icon) icon.textContent = '▶';
    }
  }

  private toggleSystemMonitor(): void {
    if (!this.toggleSystemMonitorBtn || !this.systemMonitorContent) return;
    
    const icon = this.toggleSystemMonitorBtn.querySelector('.toggle-monitor-icon');
    if (this.systemMonitorContent.style.display === 'none') {
      this.systemMonitorContent.style.display = 'block';
      if (icon) icon.textContent = '▼';
    } else {
      this.systemMonitorContent.style.display = 'none';
      if (icon) icon.textContent = '▶';
    }
  }

  private startSystemMonitoring(): void {
    // Initial update
    this.updateSystemStats();
    
    // Update every 2 seconds
    this.systemMonitorInterval = setInterval(() => {
      this.updateSystemStats();
    }, 2000);
  }

  private async updateSystemStats(): Promise<void> {
    try {
      // Get RAM usage using vm_stat for accurate memory calculation
      const os = require('os');
      const totalMem = os.totalmem();
      
      let usedMem = totalMem - os.freemem(); // fallback
      let freeMem = os.freemem(); // fallback
      
      if (process.platform === 'darwin') {
        try {
          // Get used memory (all, including cache) using vm_stat
          const { stdout: usedAllOut } = await execAsync('vm_stat | perl -ne \'/page size of (\\d+)/ and $s=$1; /Pages free:\\s+(\\d+)/ and $f=$1; END { $total = `sysctl -n hw.memsize`; chomp $total; printf "%.0f", ($total - $f*$s) }\'');
          const usedAllBytes = parseFloat(usedAllOut.trim());
          
          // Get cached memory (inactive + speculative) using vm_stat
          const { stdout: cachedOut } = await execAsync('vm_stat | perl -ne \'/page size of (\\d+)/ and $s=$1; /Pages inactive:\\s+(\\d+)/ and $i=$1; /Pages speculative:\\s+(\\d+)/ and $sp=$1; END { printf "%.0f", ($i+$sp)*$s }\'');
          const cachedBytes = parseFloat(cachedOut.trim());
          
          // Used memory = Used (all, incl cache) - Cached
          if (!isNaN(usedAllBytes) && !isNaN(cachedBytes) && usedAllBytes > 0 && cachedBytes >= 0) {
            usedMem = usedAllBytes - cachedBytes;
          }
          
          // Get available memory (free + inactive + speculative) using vm_stat
          const { stdout: freeOut } = await execAsync('vm_stat | perl -ne \'/page size of (\\d+)/ and $s=$1; /Pages free:\\s+(\\d+)/ and $f=$1; /Pages inactive:\\s+(\\d+)/ and $i=$1; /Pages speculative:\\s+(\\d+)/ and $sp=$1; END { printf "%.0f", ($f+$i+$sp)*$s }\'');
          const freeBytes = parseFloat(freeOut.trim());
          if (!isNaN(freeBytes) && freeBytes > 0) {
            freeMem = freeBytes;
          }
        } catch (e) {
          console.error('Error getting memory from vm_stat:', e);
        }
      }
      
      const ramPercent = (usedMem / totalMem) * 100;
      
      // Convert to GB
      const usedMemGB = (usedMem / (1024 * 1024 * 1024)).toFixed(2);
      const freeMemGB = (freeMem / (1024 * 1024 * 1024)).toFixed(2);
      const totalMemGB = (totalMem / (1024 * 1024 * 1024)).toFixed(2);
      
      if (this.ramUsageEl) {
        this.ramUsageEl.textContent = `${ramPercent.toFixed(1)}%`;
      }
      if (this.ramUsedEl) {
        this.ramUsedEl.textContent = `${usedMemGB} GB`;
      }
      if (this.ramFreeEl) {
        this.ramFreeEl.textContent = `${freeMemGB} GB`;
      }
      if (this.ramTotalEl) {
        this.ramTotalEl.textContent = `${totalMemGB} GB`;
      }
      if (this.ramBarEl) {
        this.ramBarEl.style.width = `${ramPercent}%`;
        this.updateBarColor(this.ramBarEl, ramPercent);
      }
      
      await this.updateOllamaProcessStats();

      // Get CPU usage on macOS using top command
      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execAsync('top -l 1 -n 0 | grep "CPU usage"');
          // Parse: "CPU usage: 3.57% user, 2.38% sys, 94.4% idle"
          const userMatch = stdout.match(/([\d.]+)% user/);
          const sysMatch = stdout.match(/([\d.]+)% sys/);
          const idleMatch = stdout.match(/([\d.]+)% idle/);
          
          if (userMatch && sysMatch && idleMatch) {
            const userPercent = parseFloat(userMatch[1]);
            const sysPercent = parseFloat(sysMatch[1]);
            const idlePercent = parseFloat(idleMatch[1]);
            const totalUsed = userPercent + sysPercent;
            
            if (this.cpuUsageEl) {
              this.cpuUsageEl.textContent = `${totalUsed.toFixed(1)}%`;
            }
            if (this.cpuUserEl) {
              this.cpuUserEl.textContent = `${userPercent.toFixed(1)}%`;
            }
            if (this.cpuSystemEl) {
              this.cpuSystemEl.textContent = `${sysPercent.toFixed(1)}%`;
            }
            if (this.cpuIdleEl) {
              this.cpuIdleEl.textContent = `${idlePercent.toFixed(1)}%`;
            }
            if (this.cpuBarEl) {
              this.cpuBarEl.style.width = `${totalUsed}%`;
              this.updateBarColor(this.cpuBarEl, totalUsed);
            }
          }
        } catch (e) {
          if (this.cpuUsageEl && this.cpuUsageEl.textContent === '--') {
            this.cpuUsageEl.textContent = 'N/A';
            if (this.cpuUserEl) this.cpuUserEl.textContent = 'N/A';
            if (this.cpuSystemEl) this.cpuSystemEl.textContent = 'N/A';
            if (this.cpuIdleEl) this.cpuIdleEl.textContent = 'N/A';
          }
        }
        
      } else {
        // For non-macOS platforms, show N/A
        if (this.cpuUsageEl) this.cpuUsageEl.textContent = 'N/A';
      }
    } catch (error) {
      console.error('Error updating system stats:', error);
    }
  }

  private updateBarColor(barEl: HTMLElement, percent: number): void {
    barEl.classList.remove('high', 'medium');
    if (percent >= 80) {
      barEl.classList.add('high');
    } else if (percent >= 60) {
      barEl.classList.add('medium');
    }
  }

  private async updateOllamaProcessStats(): Promise<void> {
    const setFields = (cols: Record<string, string> | null) => {
      const safe = (val: string | undefined) => val && val.trim() ? val.trim() : '--';
      if (!cols) {
        this.ollamaModelNameEl && (this.ollamaModelNameEl.textContent = '--');
        this.ollamaModelIdEl && (this.ollamaModelIdEl.textContent = '--');
        this.ollamaModelSizeEl && (this.ollamaModelSizeEl.textContent = '--');
        this.ollamaModelProcessorEl && (this.ollamaModelProcessorEl.textContent = '--');
        this.ollamaModelContextEl && (this.ollamaModelContextEl.textContent = '--');
        this.ollamaModelUntilEl && (this.ollamaModelUntilEl.textContent = '--');
        return;
      }
      this.ollamaModelNameEl && (this.ollamaModelNameEl.textContent = safe(cols['NAME']));
      this.ollamaModelIdEl && (this.ollamaModelIdEl.textContent = safe(cols['ID']));
      this.ollamaModelSizeEl && (this.ollamaModelSizeEl.textContent = safe(cols['SIZE']));
      this.ollamaModelProcessorEl && (this.ollamaModelProcessorEl.textContent = safe(cols['PROCESSOR']));
      this.ollamaModelContextEl && (this.ollamaModelContextEl.textContent = safe(cols['CONTEXT']));
      this.ollamaModelUntilEl && (this.ollamaModelUntilEl.textContent = safe(cols['UNTIL']));
    };

    try {
      const ollamaPath = getOllamaPath();
      const { stdout } = await execAsync(`${ollamaPath} ps`);
      const lines = stdout
        .split('\n')
        .map((line: string) => line)
        .filter((line: string) => line.trim());
      if (lines.length < 2) {
        setFields(null);
        return;
      }

      const headerLine = lines[0];
      const dataLines = lines.slice(1);
      const headers = ['NAME', 'ID', 'SIZE', 'PROCESSOR', 'CONTEXT', 'UNTIL'];
      const positions = headers
        .map(h => ({ h, i: headerLine.indexOf(h) }))
        .filter(p => p.i >= 0)
        .sort((a, b) => a.i - b.i);

      const sliceColumns = (line: string): Record<string, string> => {
        const cols: Record<string, string> = {};
        for (let idx = 0; idx < positions.length; idx++) {
          const start = positions[idx].i;
          const end = idx + 1 < positions.length ? positions[idx + 1].i : line.length;
          cols[positions[idx].h] = line.substring(start, end).trim();
        }
        return cols;
      };

      const preferredModel = this.model;
      let chosen: Record<string, string> | null = null;
      for (const line of dataLines) {
        const cols = sliceColumns(line);
        if (cols['NAME'] && preferredModel && cols['NAME'] === preferredModel) {
          chosen = cols;
          break;
        }
        if (!chosen && cols['PROCESSOR']) {
          chosen = cols;
        }
      }

      if (!chosen) {
        setFields(null);
        return;
      }

      setFields(chosen);
    } catch (error: any) {
      setFields(null);
    }
  }

  private async checkOllamaStatus(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // Ollama is running - check if we started it or it was external
        if (!this.ollamaProcess) {
          // Running but we didn't start it - it's external
          this.ollamaIsExternal = true;
          this.disableOllamaServiceControls();
        } else {
          this.ollamaIsExternal = false;
        }
        
        this.statusLight.classList.remove('not-ready');
        this.statusLight.classList.add('ready');
        this.statusText.textContent = this.ollamaIsExternal ? 'Ready (External)' : 'Ready';
        this.statusText.style.color = '#10b981';
        this.updateControlsForAvailability(true);
        if (this.owrapTabStatusEl) this.owrapTabStatusEl.classList.add('ready');
        this.clearOllamaNotReadyNotices();
        // Only show service light if we started the process
        if (this.ollamaServiceStatusLight) {
          if (this.ollamaProcess) {
            this.ollamaServiceStatusLight.classList.add('ready');
          } else {
            this.ollamaServiceStatusLight.classList.remove('ready');
          }
        }
        // Show controls light when Ollama is ready (regardless of how it was started)
        if (this.ollamaControlsStatusLight) this.ollamaControlsStatusLight.classList.add('ready');
        // Auto-refresh models once when becoming ready
        if (!this.loadingModels) {
          this.loadingModels = true;
          try {
            await this.loadAvailableModels();
          } catch (e) {
            console.warn('Auto-refresh models failed:', e);
            this.loadingModels = false;
          }
        }
      } else {
        this.loadingModels = false;
        this.ollamaIsExternal = false;
        this.enableOllamaServiceControls();
        this.setNotReady(`Not responding (${response.status})`);
        if (this.owrapTabStatusEl) this.owrapTabStatusEl.classList.remove('ready');
        if (this.ollamaServiceStatusLight) this.ollamaServiceStatusLight.classList.remove('ready');
        if (this.ollamaControlsStatusLight) this.ollamaControlsStatusLight.classList.remove('ready');
      }
    } catch (error: any) {
      this.loadingModels = false;
      this.ollamaIsExternal = false;
      this.enableOllamaServiceControls();
      
      // Provide more specific error messages
      let errorMsg = 'Not available';
      if (error.name === 'AbortError') {
        errorMsg = 'Connection timeout';
      } else if (error.message.includes('Failed to fetch')) {
        errorMsg = 'Connection failed';
      }
      
      this.setNotReady(errorMsg);
      if (this.owrapTabStatusEl) this.owrapTabStatusEl.classList.remove('ready');
      if (this.ollamaServiceStatusLight) this.ollamaServiceStatusLight.classList.remove('ready');
      if (this.ollamaControlsStatusLight) this.ollamaControlsStatusLight.classList.remove('ready');
    }
  }

  private setNotReady(message: string): void {
    this.statusLight.classList.remove('ready');
    this.statusLight.classList.add('not-ready');
    this.statusText.textContent = message;
    this.statusText.style.color = '#ef4444';
    // If Ollama is not available, disable model and prompt controls
    if (message === 'Not available') {
      this.updateControlsForAvailability(false);
    }
    if (this.owrapTabStatusEl) {
      this.owrapTabStatusEl.classList.remove('ready');
    }
    if (this.ollamaServiceStatusLight) {
      this.ollamaServiceStatusLight.classList.remove('ready');
    }
    if (this.ollamaControlsStatusLight) {
      this.ollamaControlsStatusLight.classList.remove('ready');
    }
  }

  private clearOllamaNotReadyNotices(): void {
    let shouldRerender = false;
    for (const [sessionId, session] of this.sessions.entries()) {
      const before = session.messages.length;
      session.messages = session.messages.filter(m => !(m.role === 'system' && m.content === 'Ollama is not ready. Please make sure Ollama is running.'));
      if (sessionId === this.currentSessionId && session.messages.length !== before) {
        shouldRerender = true;
      }
    }
    if (shouldRerender) {
      this.renderMessages();
    }
  }

  private updateModelPullButtons(): void {
    const modelPullBtns = document.querySelectorAll('.model-pull-btn') as NodeListOf<HTMLButtonElement>;
    const isLocalOllama = this.ollamaProcess !== null;
    
    modelPullBtns.forEach((btn) => {
      if (isLocalOllama) {
        btn.disabled = false;
      } else {
        btn.disabled = true;
      }
    });
  }

  private async pullModel(button: HTMLButtonElement, modelName: string): Promise<void> {
    const originalText = button.textContent;
    
    try {
      button.disabled = true;
      button.classList.add('pulling');
      button.textContent = '⏳ Pulling...';
      
      const ollamaPath = getOllamaPath();
      const { spawn } = require('child_process');
      
      // Run ollama pull command
      const pullProcess = spawn(ollamaPath, ['pull', modelName]);
      
      let output = '';
      
      pullProcess.stdout.on('data', (data: any) => {
        output += data.toString();
        // Update button with progress if available
        const lines = output.split('\n');
        const lastLine = lines[lines.length - 2] || lines[lines.length - 1];
        if (lastLine && lastLine.trim()) {
          button.textContent = `⏳ ${lastLine.trim().substring(0, 20)}...`;
        }
      });
      
      pullProcess.stderr.on('data', (data: any) => {
        console.error('Pull error:', data.toString());
      });
      
      await new Promise<void>((resolve, reject) => {
        pullProcess.on('close', (code: number) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Pull failed with code ${code}`));
          }
        });
      });
      
      // Success
      button.classList.remove('pulling');
      button.classList.add('success');
      button.textContent = '✅ Pulled!';
      
      // Refresh the models list
      await this.loadAvailableModels();
      
      // Reset button after 3 seconds
      setTimeout(() => {
        button.classList.remove('success');
        button.disabled = false;
        button.textContent = originalText;
      }, 3000);
      
    } catch (error: any) {
      console.error('Failed to pull model:', error);
      button.classList.remove('pulling');
      button.textContent = '❌ Failed';
      
      // Reset button after 3 seconds
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 3000);
    }
  }

  private updateControlsForAvailability(isAvailable: boolean): void {
    try {
      if (this.modelSelect) {
        this.modelSelect.disabled = !isAvailable;
        if (!isAvailable) this.modelSelect.classList.add('disabled-control'); else this.modelSelect.classList.remove('disabled-control');
      }
      if (this.promptSelect) {
        this.promptSelect.disabled = !isAvailable;
        if (!isAvailable) this.promptSelect.classList.add('disabled-control'); else this.promptSelect.classList.remove('disabled-control');
      }
      if (this.showPromptBtn) {
        (this.showPromptBtn as HTMLButtonElement).disabled = !isAvailable;
        if (!isAvailable) this.showPromptBtn.classList.add('disabled-control'); else this.showPromptBtn.classList.remove('disabled-control');
      }
      if (this.refreshModelsBtn) {
        (this.refreshModelsBtn as HTMLButtonElement).disabled = !isAvailable;
        if (!isAvailable) this.refreshModelsBtn.classList.add('disabled-control'); else this.refreshModelsBtn.classList.remove('disabled-control');
      }
    } catch (err) {
      console.warn('updateControlsForAvailability failed:', err);
    }
  }

  private appendOllamaLog(line: string): void {
    if (!this.ollamaLogEl) return;
    // Append safely
    this.ollamaLogEl.textContent += line + '\n';
    this.ollamaLogEl.scrollTop = this.ollamaLogEl.scrollHeight;
  }

  private startOllama(): void {
    if (this.ollamaProcess) return;
    
    // Update URL from input before starting
    this.updateOllamaUrl();
    
    const spawn = require('child_process').spawn;
    
    try {
      // Find ollama executable path
      const ollamaPath = getOllamaPath();
      
      console.log('Starting Ollama with path:', ollamaPath);
      const env = Object.assign({}, process.env /*, { OLLAMA_HOST: '0.0.0.0' } */); // OLLAMA_HOST intentionally disabled
      this.ollamaProcess = spawn(ollamaPath, ['serve'], { env });
      this.ollamaIsExternal = false;
      if (this.ollamaServiceStatusEl) this.ollamaServiceStatusEl.textContent = 'starting...';
      if (this.startOllamaBtn) this.startOllamaBtn.disabled = true;
      if (this.stopOllamaBtn) this.stopOllamaBtn.disabled = false;

      this.ollamaProcess.stdout.on('data', (chunk: Buffer) => {
        this.appendOllamaLog(chunk.toString());
        if (this.ollamaServiceStatusEl) this.ollamaServiceStatusEl.textContent = 'running';
      });
      this.ollamaProcess.stderr.on('data', (chunk: Buffer) => {
        this.appendOllamaLog(chunk.toString());
      });
      this.ollamaProcess.on('close', (code: number) => {
        this.appendOllamaLog(`Ollama exited with code ${code}`);
        this.ollamaProcess = null;
        if (this.ollamaServiceStatusEl) this.ollamaServiceStatusEl.textContent = 'stopped';
        if (this.startOllamaBtn) this.startOllamaBtn.disabled = false;
        if (this.stopOllamaBtn) this.stopOllamaBtn.disabled = true;
      });
      
      this.ollamaProcess.on('error', (err: Error) => {
        this.appendOllamaLog('Ollama process error: ' + err.message);
        if (err.message.includes('ENOENT')) {
          this.appendOllamaLog('Error: Ollama executable not found. Please install Ollama first.');
          this.appendOllamaLog('Visit: https://ollama.ai/download');
        }
        this.ollamaProcess = null;
        if (this.ollamaServiceStatusEl) this.ollamaServiceStatusEl.textContent = 'error';
        if (this.startOllamaBtn) this.startOllamaBtn.disabled = false;
        if (this.stopOllamaBtn) this.stopOllamaBtn.disabled = true;
      });
    } catch (err) {
      this.appendOllamaLog('Failed to start ollama: ' + String(err));
      if (this.startOllamaBtn) this.startOllamaBtn.disabled = false;
      if (this.stopOllamaBtn) this.stopOllamaBtn.disabled = true;
    }
  }

  private stopOllama(): void {
    if (!this.ollamaProcess) return;
    try {
      const pid = this.ollamaProcess.pid;
      process.kill(pid, 'SIGTERM');
      this.appendOllamaLog(`Sent SIGTERM to Ollama (pid ${pid})`);
    } catch (err) {
      this.appendOllamaLog('Failed to stop ollama: ' + String(err));
    }
  }

  private disableOllamaServiceControls(): void {
    if (this.startOllamaBtn) {
      this.startOllamaBtn.disabled = true;
      this.startOllamaBtn.title = 'Ollama is running externally';
    }
    if (this.stopOllamaBtn) {
      this.stopOllamaBtn.disabled = true;
      this.stopOllamaBtn.title = 'Cannot stop external Ollama';
    }
    if (this.ollamaServiceContent) {
      this.ollamaServiceContent.style.opacity = '0.5';
      this.ollamaServiceContent.style.pointerEvents = 'none';
    }
    if (this.ollamaServiceStatusEl) {
      this.ollamaServiceStatusEl.textContent = 'external';
      this.ollamaServiceStatusEl.style.color = '#888';
    }
  }

  private enableOllamaServiceControls(): void {
    if (!this.ollamaProcess && !this.ollamaIsExternal) {
      if (this.startOllamaBtn) {
        this.startOllamaBtn.disabled = false;
        this.startOllamaBtn.title = 'Start Ollama service';
      }
      if (this.ollamaServiceContent) {
        this.ollamaServiceContent.style.opacity = '1';
        this.ollamaServiceContent.style.pointerEvents = 'auto';
      }
      if (this.ollamaServiceStatusEl) {
        this.ollamaServiceStatusEl.textContent = 'stopped';
        this.ollamaServiceStatusEl.style.color = '';
      }
    }
  }

  public formatMarkdownPublic(text: string): string {
    return this.formatMarkdown(text);
  }

  private formatMarkdown(text: string): string {
    // Escape HTML to prevent XSS
    const escapeHtml = (str: string) => {
      return str.replace(/[&<>"']/g, (char) => {
        const map: { [key: string]: string } = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        };
        return map[char];
      });
    };

    // Process code blocks (```language\ncode\n```)
    let formatted = text.replace(/```([a-zA-Z]*)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || 'plaintext';
      return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Process inline code (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
      return `<code>${escapeHtml(code)}</code>`;
    });

    // Convert line breaks to <br> for non-code-block content
    // Split by pre tags to avoid adding br inside code blocks
    const parts = formatted.split(/(<pre>.*?<\/pre>)/s);
    formatted = parts.map((part, idx) => {
      if (idx % 2 === 0) { // Text parts (not code blocks)
        return part.replace(/\n/g, '<br>');
      }
      return part; // Code block parts unchanged
    }).join('');

    return formatted;
  }

  private addMessage(role: string, content: string): void {
    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.messages.push({ role, content });
      this.renderMessages();
    }
  }

  // Public method to get or create OSM locations session
  public getOrCreateOSMSession(): void {
    // Check if OSM session already exists
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.customName === '📍 OSM Locations') {
        // Switch to this session
        this.switchToSession(sessionId);
        return;
      }
    }

    // Create new OSM session
    const sessionNumber = this.nextSessionNumber++;
    const sessionId = Date.now();
    
    const session = {
      sessionNumber: sessionNumber,
      customName: '📍 OSM Locations',
      model: this.modelSelect?.value || this.model,
      temperature: this.clampTemperature(this.temperature),
      prompt: 'You are a helpful assistant specialized in providing information about locations, places, cities, and geographic features. Answer questions naturally and concisely. When asked about places, provide useful information about attractions, history, culture, and practical tips.',
      promptSelection: 'osm_locations',
      messages: [] as Array<{role: string, content: string, timestamp?: number, duration?: number}>,
      autoSaveInterval: null as any,
      lastAutoSaveTime: 0
    };
    
    this.sessions.set(sessionId, session);
    
    // Create tab element
    const tab = document.createElement('div');
    tab.className = 'session-tab';
    tab.dataset.sessionId = String(sessionId);
    
    const tabLabel = document.createElement('span');
    tabLabel.className = 'session-tab-label';
    tabLabel.textContent = '📍 OSM Locations';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'session-tab-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close session';
    
    tab.appendChild(tabLabel);
    tab.appendChild(closeBtn);
    
    // Add click handlers
    tab.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('session-tab-close')) {
        this.switchToSession(sessionId);
      }
    });
    
    // Double-click to rename
    tabLabel.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      await this.renameSession(sessionId);
    });
    
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSessionTab(sessionId);
    });
    
    // Append tab to session bar
    this.sessionTabsBar.appendChild(tab);
    
    // Start auto-save for this session
    session.autoSaveInterval = setInterval(() => {
      this.autoSaveSession(sessionId);
    }, 60000);
    
    // Switch to this session
    this.switchToSession(sessionId);
  }

  // Public method to send a message programmatically from other components (e.g., OSM)
  public async askAI(question: string): Promise<string> {
    // Check if Ollama is ready
    if (!this.statusLight.classList.contains('ready')) {
      throw new Error('Ollama is not ready. Please make sure Ollama is running.');
    }

    // Get or create OSM session
    this.getOrCreateOSMSession();

    const session = this.sessions.get(this.currentSessionId);
    if (!session) {
      throw new Error('No active session');
    }

    try {
      // Add user message to chat
      this.addMessage('user', question);
      this.input.value = '';

      // Prepare messages for Ollama
      const history = session.messages.filter(m => m.role === 'user' || m.role === 'assistant');
      const chatMessages = [
        { role: 'system', content: session.prompt },
        ...history
      ];

      const temperature = this.clampTemperature(session.temperature ?? this.temperature ?? 0.7);

      // Call Ollama API
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: session.model,
          messages: chatMessages,
          stream: false,
          options: {
            temperature
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.message?.content || 'No response';

      // Add assistant message to chat
      session.messages.push({ 
        role: 'assistant', 
        content: assistantMessage,
        timestamp: Date.now()
      });
      this.renderMessages();

      return assistantMessage;
    } catch (error: any) {
      this.addMessage('system', `Error: ${error.message}`);
      throw error;
    }
  }

  private async sendMessage(): Promise<void> {
    const userMessage = this.input.value.trim();
    if (!userMessage) return;

    // Check if Ollama is ready
    if (!this.statusLight.classList.contains('ready')) {
      const notReadyMessage = 'Ollama is not ready. Please make sure Ollama is running.';
      this.addMessage('system', notReadyMessage);
      
      // Remove the message after 3 seconds
      setTimeout(() => {
        const session = this.sessions.get(this.currentSessionId);
        if (session) {
          session.messages = session.messages.filter(m => !(m.role === 'system' && m.content === notReadyMessage));
          this.renderMessages();
        }
      }, 3000);
      
      return;
    }

    const session = this.sessions.get(this.currentSessionId);
    if (!session) return;

    // Add to recent prompts
    this.addToRecentPrompts(userMessage);

    // Disable send button
    this.sendBtn.disabled = true;
    this.sendBtn.textContent = '⏳ Thinking...';

    // Add user message to chat and history only once
    this.addMessage('user', userMessage);
    this.input.value = '';

    // Track timing
    const startTime = Date.now();

    try {
      // Prepare messages for Ollama
      // Only send user/assistant history to the model; skip internal system notices
      const history = session.messages.filter(m => m.role === 'user' || m.role === 'assistant');
      const chatMessages = [
        { role: 'system', content: session.prompt },
        ...history
      ];

      const temperature = this.clampTemperature(session.temperature ?? this.temperature ?? 0.7);

      // Call Ollama API
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: session.model,
          messages: chatMessages,
          stream: false,
          options: {
            temperature
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.message?.content || 'No response';
      
      // Calculate duration
      const duration = (Date.now() - startTime) / 1000;

      // Add assistant message to chat and history only if not duplicate
      const lastMsg = session.messages[session.messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content !== assistantMessage) {
        session.messages.push({ 
          role: 'assistant', 
          content: assistantMessage,
          timestamp: Date.now(),
          duration: duration
        });
        this.renderMessages();
      }

    } catch (error: any) {
      this.addMessage('system', `Error: ${error.message}`);
      console.error('Ollama API error:', error);
    } finally {
      this.sendBtn.disabled = false;
      this.sendBtn.textContent = '📤 Send';
    }
  }

  private async getNextSessionNumber(): Promise<number> {
    try {
      const path = require('path');
      const os = require('os');
      const saveDir = path.join(os.homedir(), 'Downloads', 'scoutai', 'owrap');
      await execAsync(`mkdir -p "${saveDir}"`);
      
      const { stdout } = await execAsync(`ls -1 "${saveDir}"/session-*.json 2>/dev/null || echo ""`);
      const files = stdout.trim().split('\n').filter((f: string) => f);
      
      if (files.length === 0) return 1;
      
      // Extract session numbers and find the highest
      const numbers = files.map((f: string) => {
        const match = f.match(/session-(\d+)\.json$/);
        return match ? parseInt(match[1]) : 0;
      });
      
      return Math.max(...numbers) + 1;
    } catch (error) {
      return 1;
    }
  }

  private async createNewSessionTab(): Promise<void> {
    const sessionNumber = this.nextSessionNumber++;
    const sessionId = Date.now(); // Use timestamp as unique ID
    
    // Determine default prompt selection
    const defaultPromptSelection = this.promptSelect.querySelector('option[value="life_assistant.txt"]') 
      ? 'life_assistant.txt' 
      : 'default';

    // Inherit current UI selections for model and prompt to match user expectations
    const inheritedModel = this.modelSelect?.value || this.model;
    const inheritedPromptSelection = this.promptSelect?.value || defaultPromptSelection;
    const inheritedPrompt = inheritedPromptSelection === 'default'
      ? this.getDefaultPrompt()
      : await this.loadPromptContent(inheritedPromptSelection);
    const inheritedTemperature = this.clampTemperature(this.temperature);
    
    // Create session data with default values
    const session = {
      sessionNumber: sessionNumber,
      customName: undefined,
      model: inheritedModel,
      temperature: inheritedTemperature,
      prompt: inheritedPrompt,
      promptSelection: inheritedPromptSelection,
      messages: [] as Array<{role: string, content: string, timestamp?: number, duration?: number}>,
      autoSaveInterval: null as any,
      lastAutoSaveTime: 0
    };
    
    this.sessions.set(sessionId, session);
    
    // Create tab element
    const tab = document.createElement('div');
    tab.className = 'session-tab';
    tab.dataset.sessionId = sessionId.toString();
    
    const span = document.createElement('span');
    span.textContent = `Session ${sessionNumber}`;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'session-tab-close';
    closeBtn.title = 'Close session';
    closeBtn.textContent = '×';
    
    tab.appendChild(span);
    tab.appendChild(closeBtn);
    
    // Tab click handler - switch to this session
    tab.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).classList.contains('session-tab-close')) {
        this.switchToSession(sessionId);
      }
    });
    
    // Double-click to rename
    span.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      await this.renameSession(sessionId);
    });
    
    // Close button handler
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSessionTab(sessionId);
    });
    
    this.sessionTabsBar.appendChild(tab);
    
    // Start auto-save for this session
    session.autoSaveInterval = setInterval(() => {
      this.autoSaveSession(sessionId);
    }, 60000);
    
    // Switch to the new session
    this.switchToSession(sessionId);
    
    console.log(`Created new session ${sessionNumber} with ID ${sessionId}`);
  }
  
  private switchToSession(sessionId: number): void {
    this.currentSessionId = sessionId;
    
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Update global model and prompt to match session
    this.model = session.model;
    this.currentPrompt = session.prompt;
    this.temperature = this.clampTemperature(session.temperature ?? this.temperature ?? 0.7);
    session.temperature = this.temperature;
    
    // Check if this is OSM session and disable input
    const isOSMSession = session.customName === '📍 OSM Locations';
    if (isOSMSession) {
      this.input.disabled = true;
      this.sendBtn.disabled = true;
      this.input.placeholder = 'Questions come from OSM map locations...';
      this.input.style.opacity = '0.5';
    } else {
      this.input.disabled = false;
      this.sendBtn.disabled = false;
      this.input.placeholder = 'Type your message here...';
      this.input.style.opacity = '1';
    }
    
    // Update UI controls to reflect session's settings
    this.modelSelect.value = session.model;
    this.currentModelDisplay.textContent = session.model;
    this.promptSelect.value = session.promptSelection;
    this.setTemperatureControls(this.temperature);
    
    // Update tab UI
    document.querySelectorAll('.session-tab').forEach(tab => {
      if (tab.getAttribute('data-session-id') === sessionId.toString()) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    // Clear any inline height that may have been set by resize
    this.chatLog.style.removeProperty('height');
    
    // Render messages for this session
    this.renderMessages();
  }
  
  private closeSessionTab(sessionId: number): void {
    // Don't allow closing the last session
    if (this.sessions.size === 1) {
      alert('Cannot close the last session');
      return;
    }
    
    const session = this.sessions.get(sessionId);
    if (session && session.autoSaveInterval) {
      clearInterval(session.autoSaveInterval);
    }
    
    // Remove session
    this.sessions.delete(sessionId);
    
    // Remove tab element
    const tab = this.sessionTabsBar.querySelector(`[data-session-id="${sessionId}"]`);
    if (tab) {
      tab.remove();
    }
    
    // If we closed the current session, switch to another one
    if (this.currentSessionId === sessionId) {
      const firstSessionId = Array.from(this.sessions.keys())[0];
      this.switchToSession(firstSessionId);
    }
    
    console.log(`Closed session ${sessionId}`);
  }

  private async renameSession(sessionId: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const currentName = session.customName || `Session ${session.sessionNumber}`;
    const newName = await this.showInputDialog('Rename Session', 'Enter new name:', currentName);
    
    if (!newName || newName.trim() === '') return; // User cancelled or empty input
    
    // Update session custom name
    session.customName = newName.trim();
    
    // Update tab label
    const tab = this.sessionTabsBar.querySelector(`[data-session-id="${sessionId}"]`) as HTMLElement;
    if (tab) {
      const span = tab.querySelector('span');
      if (span) {
        span.textContent = session.customName;
      }
    }
    
    console.log(`Renamed session ${sessionId} to "${session.customName}"`);
    
    // Auto-save the session with the new name
    await this.autoSaveSession(sessionId);
  }

  private async autoSaveSession(sessionId: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Only auto-save if there are messages (excluding system messages)
    const nonSystemMessages = session.messages.filter(m => m.role !== 'system');
    if (nonSystemMessages.length === 0) {
      return;
    }
    
    try {
      const path = require('path');
      const os = require('os');
      const saveDir = path.join(os.homedir(), 'Downloads', 'scoutai', 'owrap');
      await execAsync(`mkdir -p "${saveDir}"`);
      
      // Use custom name if set, otherwise use session number
      const sanitizedName = session.customName 
        ? session.customName.replace(/[^a-zA-Z0-9_-]/g, '_') 
        : `session-${session.sessionNumber}`;
      const filename = `${sanitizedName}.json`;
      
      const chatData = {
        timestamp: new Date().toISOString(),
        sessionNumber: session.sessionNumber,
        customName: session.customName,
        model: session.model,
        temperature: session.temperature,
        prompt: session.prompt,
        promptSelection: session.promptSelection,
        messages: session.messages,
        autoSaved: true
      };
      
      const filePath = path.join(saveDir, filename);
      await fs.promises.writeFile(filePath, JSON.stringify(chatData, null, 2), 'utf-8');
      
      session.lastAutoSaveTime = Date.now();
      console.log(`Auto-saved session ${session.sessionNumber} at ${new Date().toLocaleTimeString()}`);
    } catch (error: any) {
      console.error('Auto-save error:', error);
    }
  }

  private fitChatLog(): void {
    if (!this.chatLog) {
      console.error('chatLog element is null or undefined!');
      return;
    }
    
    // Remove all inline sizing styles
    this.chatLog.style.removeProperty('min-height');
    this.chatLog.style.removeProperty('max-height');
    this.chatLog.style.removeProperty('flex');
    this.chatLog.style.removeProperty('flex-grow');
    this.chatLog.style.removeProperty('flex-shrink');
    this.chatLog.style.removeProperty('flex-basis');
    
    // Set to fixed default height
    this.chatLog.style.height = this.defaultChatLogHeight;
    
    // Force reflow
    void this.chatLog.offsetHeight;
    
    // Scroll to bottom to show latest messages
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    
    console.log('Fit complete - reset to default size:', this.defaultChatLogHeight);
  }

  private toggleFocusMode(): void {
    document.body.classList.toggle('focus-mode');
    const isFocusMode = document.body.classList.contains('focus-mode');
    
    if (isFocusMode) {
      this.focusModeBtn.classList.add('active');
      this.focusModeBtn.title = 'Exit Focus Mode';
    } else {
      this.focusModeBtn.classList.remove('active');
      this.focusModeBtn.title = 'Toggle Focus Mode - Hide controls and show only chat';
    }
    
    console.log('Focus mode:', isFocusMode ? 'enabled' : 'disabled');
  }

  private toggleLeftPanel(): void {
    if (!this.owrapLeftPanel) return;
    
    this.isLeftPanelCollapsed = !this.isLeftPanelCollapsed;
    
    if (this.isLeftPanelCollapsed) {
      this.owrapLeftPanel.classList.add('collapsed');
      if (this.toggleOwrapPanelBtn) {
        this.toggleOwrapPanelBtn.textContent = '▶';
        this.toggleOwrapPanelBtn.title = 'Show panel';
      }
      if (this.toggleOwrapPanelFloatBtn) {
        this.toggleOwrapPanelFloatBtn.style.display = 'flex';
      }
    } else {
      this.owrapLeftPanel.classList.remove('collapsed');
      if (this.toggleOwrapPanelBtn) {
        this.toggleOwrapPanelBtn.textContent = '◀';
        this.toggleOwrapPanelBtn.title = 'Hide panel';
      }
      if (this.toggleOwrapPanelFloatBtn) {
        this.toggleOwrapPanelFloatBtn.style.display = 'none';
      }
    }
    
    console.log('Left panel:', this.isLeftPanelCollapsed ? 'collapsed' : 'expanded');
  }

  private async saveChatHistory(): Promise<void> {
    const session = this.sessions.get(this.currentSessionId);
    if (!session || session.messages.length === 0) {
      const noHistoryMessage = 'No chat history to save.';
      this.addMessage('system', noHistoryMessage);
      
      // Remove the message after 2 seconds
      if (this.clearNoticeTimeout) {
        clearTimeout(this.clearNoticeTimeout);
      }
      this.clearNoticeTimeout = setTimeout(() => {
        if (session) {
          session.messages = session.messages.filter(m => !(m.role === 'system' && m.content === noHistoryMessage));
          this.renderMessages();
        }
        this.clearNoticeTimeout = null;
      }, 2000);
      
      return;
    }

    try {
      const path = require('path');
      const os = require('os');
      const saveDir = path.join(os.homedir(), 'Downloads', 'scoutai', 'owrap');
      
      // Create directory if it doesn't exist
      await execAsync(`mkdir -p "${saveDir}"`);
      
      // List existing saved sessions
      let existingFiles: string[] = [];
      try {
        const { stdout } = await execAsync(`ls -1 "${saveDir}"/*.json 2>/dev/null || echo ""`);
        existingFiles = stdout.trim().split('\n').filter((f: string) => f);
      } catch (e) {
        // Directory might not exist yet, that's okay
      }
      
      // Create custom input modal with existing files list
      const customName = await this.showSaveDialog(
        'Save Chat History',
        'Enter a name for the chat history (leave empty for timestamp):',
        existingFiles
      );
      
      if (customName === null) return; // User cancelled
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = customName.trim() ? `${customName.trim()}.json` : `chat-${timestamp}.json`;
      
      // If user provided a custom name, update the session and tab
      if (customName.trim()) {
        session.customName = customName.trim();
        
        // Update tab label
        const tab = this.sessionTabsBar.querySelector(`[data-session-id="${this.currentSessionId}"]`) as HTMLElement;
        if (tab) {
          const span = tab.querySelector('span');
          if (span) {
            span.textContent = session.customName;
          }
        }
      }
      
      // Save chat history
      const chatData = {
        timestamp: new Date().toISOString(),
        sessionNumber: session.sessionNumber,
        customName: session.customName,
        model: session.model,
        temperature: session.temperature,
        prompt: session.prompt,
        promptSelection: session.promptSelection,
        messages: session.messages,
        autoSaved: false
      };
      
      const filePath = path.join(saveDir, filename);
      await fs.promises.writeFile(filePath, JSON.stringify(chatData, null, 2), 'utf-8');
      
      const saveMessage = `Chat history saved to: ${filePath}`;
      this.addMessage('system', saveMessage);
      
      // Remove the save message after 2 seconds
      if (this.clearNoticeTimeout) {
        clearTimeout(this.clearNoticeTimeout);
      }
      this.clearNoticeTimeout = setTimeout(() => {
        const currentSession = this.sessions.get(this.currentSessionId);
        if (currentSession) {
          currentSession.messages = currentSession.messages.filter(m => !(m.role === 'system' && m.content === saveMessage));
          this.renderMessages();
        }
        this.clearNoticeTimeout = null;
      }, 2000);
    } catch (error: any) {
      this.addMessage('system', `Error saving chat history: ${error.message}`);
      console.error('Save error:', error);
    }
  }

  private async loadChatHistory(): Promise<void> {
    try {
      const path = require('path');
      const os = require('os');
      const saveDir = path.join(os.homedir(), 'Downloads', 'scoutai', 'owrap');
      
      // List available files
      const { stdout } = await execAsync(`ls -1 "${saveDir}"/*.json 2>/dev/null || echo ""`);
      const files = stdout.trim().split('\n').filter((f: string) => f);
      
      if (files.length === 0) {
        const notice = 'No saved chat histories found in ~/Downloads/scoutai/owrap';
        this.addMessage('system', notice);

        // Auto-clear the notice after a short delay so it doesn't linger
        if (this.clearNoticeTimeout) {
          clearTimeout(this.clearNoticeTimeout);
        }
        this.clearNoticeTimeout = setTimeout(() => {
          const currentSession = this.sessions.get(this.currentSessionId);
          if (currentSession) {
            currentSession.messages = currentSession.messages.filter(m => !(m.role === 'system' && m.content === notice));
            this.renderMessages();
          }
          this.clearNoticeTimeout = null;
        }, 2000);
        
        return;
      }
      
      // Show file selection dialog with list
      const selection = await this.showFileSelectionDialog('Load Chat History', files);
      
      if (!selection) return;
      
      let filePath: string;
      // Check if it's a direct file path (from list click)
      if (selection.startsWith('/')) {
        filePath = selection;
      } else {
        // It's a typed name or number
        const num = parseInt(selection);
        if (!isNaN(num) && num > 0 && num <= files.length) {
          filePath = files[num - 1];
        } else {
          filePath = path.join(saveDir, selection.endsWith('.json') ? selection : `${selection}.json`);
        }
      }
      
      // Read and load chat history
      const content = await readFileAsync(filePath, 'utf-8');
      const chatData = JSON.parse(content);
      
      const customName = chatData.customName || undefined;
      
      // Check if a session with this custom name already exists
      let sessionId: number;
      let existingSessionId: number | null = null;
      
      if (customName) {
        for (const [existingId, existingSession] of this.sessions.entries()) {
          if (existingSession.customName === customName) {
            existingSessionId = existingId;
            break;
          }
        }
      }
      
      if (existingSessionId !== null) {
        // Session already exists, update it with file data
        sessionId = existingSessionId;
        const existingSession = this.sessions.get(sessionId)!;
        
        // Update session data from file
        existingSession.model = chatData.model || this.model;
        existingSession.temperature = this.clampTemperature(chatData.temperature ?? existingSession.temperature ?? this.temperature ?? 0.7);
        existingSession.prompt = chatData.prompt || this.currentPrompt;
        existingSession.promptSelection = chatData.promptSelection || this.promptSelect.value;
        existingSession.messages = chatData.messages || [];
        
        console.log(`Session "${customName}" reloaded from file`);
      } else {
        // Create a new session for the loaded chat
        sessionId = Date.now();
        const sessionNumber = chatData.sessionNumber || this.sessions.size + 1;
        
        const newSession = {
          sessionNumber,
          customName,
          model: chatData.model || this.model,
          temperature: this.clampTemperature(chatData.temperature ?? this.temperature ?? 0.7),
          prompt: chatData.prompt || this.currentPrompt,
          promptSelection: chatData.promptSelection || this.promptSelect.value,
          messages: chatData.messages || [],
          autoSaveInterval: null as any,
          lastAutoSaveTime: 0
        };
        
        this.sessions.set(sessionId, newSession);
        
        // Create tab element for loaded session
        const tab = document.createElement('div');
        tab.className = 'session-tab';
        tab.dataset.sessionId = sessionId.toString();
        
        const span = document.createElement('span');
        span.textContent = customName || `Session ${sessionNumber}`;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'session-tab-close';
        closeBtn.title = 'Close session';
        closeBtn.textContent = '×';
        
        tab.appendChild(span);
        tab.appendChild(closeBtn);
        
        // Tab click handler
        tab.addEventListener('click', (e) => {
          if (!(e.target as HTMLElement).classList.contains('session-tab-close')) {
            this.switchToSession(sessionId);
          }
        });
        
        // Double-click to rename
        span.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          await this.renameSession(sessionId);
        });
        
        // Close button handler
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeSessionTab(sessionId);
        });
        
        this.sessionTabsBar.appendChild(tab);
        
        // Start auto-save for the loaded session
        newSession.autoSaveInterval = setInterval(() => {
          this.autoSaveSession(sessionId);
        }, 60000);
      }
      
      // Switch to the session (whether it's new or reloaded)
      this.switchToSession(sessionId);
      
      console.log(`Chat history loaded from: ${path.basename(filePath)}`);
      
    } catch (error: any) {
      this.addMessage('system', `Error loading chat history: ${error.message}`);
      console.error('Load error:', error);
    }
  }

  private clearChat(): void {
    console.log('=== clearChat function called ===');
    console.log('currentSessionId:', this.currentSessionId);
    console.log('sessions Map size:', this.sessions.size);
    console.log('sessions Map keys:', Array.from(this.sessions.keys()));
    
    const session = this.sessions.get(this.currentSessionId);
    console.log('Session found:', !!session);
    
    if (!session) {
      console.error('No session found for currentSessionId:', this.currentSessionId);
      console.log('All sessions:', Array.from(this.sessions.entries()));
      return;
    }
    
    console.log('Before clear - messages count:', session.messages.length);
    console.log('chatLog element:', this.chatLog);
    console.log('chatLog innerHTML length:', this.chatLog.innerHTML.length);
    
    this.chatLog.innerHTML = '';
    session.messages = [];
    
    console.log('After innerHTML clear - innerHTML length:', this.chatLog.innerHTML.length);
    console.log('After messages clear - messages count:', session.messages.length);
    
    // Add ephemeral notice
    this.addMessage('system', 'Chat cleared. Start a new conversation!');
    
    console.log('After addMessage - messages count:', session.messages.length);
    
    if (this.clearNoticeTimeout) {
      clearTimeout(this.clearNoticeTimeout);
    }
    this.clearNoticeTimeout = setTimeout(() => {
      session.messages = session.messages.filter(m => !(m.role === 'system' && m.content === 'Chat cleared. Start a new conversation!'));
      this.renderMessages();
      this.clearNoticeTimeout = null;
    }, 2000);
    
    console.log('=== clearChat function complete ===');
  }

  private showInputDialog(title: string, message: string, defaultValue: string = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--section-bg);
        color: var(--text-primary);
        padding: 30px;
        border-radius: 15px;
        max-width: 500px;
        min-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      `;

      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.marginBottom = '15px';

      const messageEl = document.createElement('pre');
      messageEl.textContent = message;
      messageEl.style.cssText = `
        white-space: pre-wrap;
        word-wrap: break-word;
        background: var(--tab-bg);
        padding: 15px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-primary);
        margin-bottom: 15px;
      `;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue;
      input.style.cssText = `
        width: 100%;
        padding: 10px;
        border: 2px solid var(--input-border);
        border-radius: 8px;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 14px;
        margin-bottom: 15px;
        box-sizing: border-box;
      `;

      const buttonGroup = document.createElement('div');
      buttonGroup.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      `;

      const okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.style.cssText = `
        padding: 10px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      `;

      const cleanup = () => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      };

      okBtn.addEventListener('click', () => {
        cleanup();
        resolve(input.value);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      // Handle Enter key
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          cleanup();
          resolve(input.value);
        } else if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(null);
        }
      });

      buttonGroup.appendChild(cancelBtn);
      buttonGroup.appendChild(okBtn);
      content.appendChild(titleEl);
      content.appendChild(messageEl);
      content.appendChild(input);
      content.appendChild(buttonGroup);
      modal.appendChild(content);
      document.body.appendChild(modal);
      
      // Focus input
      setTimeout(() => input.focus(), 100);
    });
  }

  private showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--section-bg);
        color: var(--text-primary);
        padding: 30px;
        border-radius: 15px;
        max-width: 450px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      `;

      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.cssText = `
        margin: 0 0 15px 0;
        font-size: 20px;
      `;

      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.cssText = `
        margin: 0 0 25px 0;
        color: var(--text-secondary);
        font-size: 15px;
        line-height: 1.5;
      `;

      const buttonGroup = document.createElement('div');
      buttonGroup.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      `;

      const yesBtn = document.createElement('button');
      yesBtn.textContent = 'Yes';
      yesBtn.style.cssText = `
        padding: 10px 24px;
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;

      const noBtn = document.createElement('button');
      noBtn.textContent = 'No';
      noBtn.style.cssText = `
        padding: 10px 24px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;

      const cleanup = () => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      };

      yesBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      noBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      // ESC key to cancel
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      });

      buttonGroup.appendChild(noBtn);
      buttonGroup.appendChild(yesBtn);
      content.appendChild(titleEl);
      content.appendChild(messageEl);
      content.appendChild(buttonGroup);
      modal.appendChild(content);
      document.body.appendChild(modal);

      // Focus No button by default
      setTimeout(() => noBtn.focus(), 100);
    });
  }

  private showSaveDialog(title: string, message: string, existingFiles: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--section-bg);
        color: var(--text-primary);
        padding: 30px;
        border-radius: 15px;
        max-width: 600px;
        min-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      `;

      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.marginBottom = '15px';

      const messageEl = document.createElement('p');
      messageEl.textContent = message;
      messageEl.style.cssText = `
        margin-bottom: 15px;
        color: var(--text-secondary);
        font-size: 14px;
      `;

      // Show existing files if any
      if (existingFiles.length > 0) {
        const existingLabel = document.createElement('p');
        existingLabel.textContent = 'Existing saved sessions (click to use name):';
        existingLabel.style.cssText = `
          margin-bottom: 10px;
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
        `;

        const fileListEl = document.createElement('div');
        fileListEl.style.cssText = `
          max-height: 200px;
          overflow-y: auto;
          background: var(--tab-bg);
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 15px;
        `;

        existingFiles.forEach((filePath: string) => {
          const fileBtn = document.createElement('button');
          const fileName = path.basename(filePath, '.json');
          fileBtn.textContent = `📄 ${fileName}`;
          fileBtn.style.cssText = `
            width: 100%;
            text-align: left;
            padding: 8px 12px;
            background: var(--input-bg);
            color: var(--text-primary);
            border: 1px solid var(--input-border);
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
            margin-bottom: 5px;
          `;

          fileBtn.addEventListener('mouseover', () => {
            fileBtn.style.background = 'var(--button-hover-bg, #374151)';
            fileBtn.style.borderColor = '#667eea';
          });

          fileBtn.addEventListener('mouseout', () => {
            fileBtn.style.background = 'var(--input-bg)';
            fileBtn.style.borderColor = 'var(--input-border)';
          });

          fileBtn.addEventListener('click', () => {
            input.value = fileName;
            input.focus();
          });

          fileListEl.appendChild(fileBtn);
        });

        content.appendChild(titleEl);
        content.appendChild(messageEl);
        content.appendChild(existingLabel);
        content.appendChild(fileListEl);
      } else {
        content.appendChild(titleEl);
        content.appendChild(messageEl);
      }

      const input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = `
        width: 100%;
        padding: 12px;
        margin-bottom: 20px;
        border: 2px solid var(--input-border);
        border-radius: 8px;
        font-size: 15px;
        background: var(--input-bg);
        color: var(--text-primary);
      `;

      const buttonGroup = document.createElement('div');
      buttonGroup.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      `;

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = `
        padding: 10px 24px;
        background: #10b981;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 10px 24px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      `;

      const cleanup = () => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
        document.removeEventListener('keydown', handleEsc);
      };

      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      };

      saveBtn.addEventListener('click', () => {
        cleanup();
        resolve(input.value);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      input.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          cleanup();
          resolve(input.value);
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(null);
        }
      });

      document.addEventListener('keydown', handleEsc);

      buttonGroup.appendChild(cancelBtn);
      buttonGroup.appendChild(saveBtn);
      content.appendChild(input);
      content.appendChild(buttonGroup);
      modal.appendChild(content);
      document.body.appendChild(modal);

      setTimeout(() => input.focus(), 100);
    });
  }

  private showFileSelectionDialog(title: string, files: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      const content = document.createElement('div');
      content.style.cssText = `
        background: var(--section-bg);
        color: var(--text-primary);
        padding: 30px;
        border-radius: 15px;
        max-width: 600px;
        min-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      `;

      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.marginBottom = '15px';

      const instructionsEl = document.createElement('p');
      instructionsEl.textContent = 'Click a file to load or type a filename below:';
      instructionsEl.style.cssText = `
        margin-bottom: 15px;
        color: var(--text-secondary);
        font-size: 14px;
      `;

      const fileListEl = document.createElement('div');
      fileListEl.style.cssText = `
        max-height: 300px;
        overflow-y: auto;
        background: var(--tab-bg);
        border-radius: 8px;
        padding: 10px;
        margin-bottom: 15px;
      `;

      files.forEach((filePath: string) => {
        const fileItem = document.createElement('div');
        fileItem.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 5px;
        `;

        const fileBtn = document.createElement('button');
        const fileName = path.basename(filePath);
        fileBtn.textContent = `📄 ${fileName}`;
        fileBtn.style.cssText = `
          flex: 1;
          text-align: left;
          padding: 10px 15px;
          background: var(--input-bg);
          color: var(--text-primary);
          border: 2px solid var(--input-border);
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete this file';
        deleteBtn.style.cssText = `
          width: 32px;
          height: 32px;
          padding: 0;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 20px;
          font-weight: bold;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        fileBtn.addEventListener('mouseover', () => {
          fileBtn.style.background = 'var(--button-hover-bg, #374151)';
          fileBtn.style.borderColor = '#667eea';
        });

        fileBtn.addEventListener('mouseout', () => {
          fileBtn.style.background = 'var(--input-bg)';
          fileBtn.style.borderColor = 'var(--input-border)';
        });

        deleteBtn.addEventListener('mouseover', () => {
          deleteBtn.style.background = '#dc2626';
        });

        deleteBtn.addEventListener('mouseout', () => {
          deleteBtn.style.background = '#ef4444';
        });

        fileBtn.addEventListener('click', () => {
          cleanup();
          resolve(filePath);
        });

        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          
          // Show confirmation modal
          const confirmDelete = await this.showConfirmDialog(
            'Delete File',
            `Do you really want to delete "${fileName}"?`
          );
          
          if (confirmDelete) {
            try {
              const fs = require('fs').promises;
              await fs.unlink(filePath);
              
              // Remove from UI
              fileItem.remove();
              
              // Remove from files array
              const index = files.indexOf(filePath);
              if (index > -1) {
                files.splice(index, 1);
              }
              
              // If no files left, show message
              if (files.length === 0) {
                fileListEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No files available</div>';
              }
            } catch (err) {
              alert(`Failed to delete file: ${err}`);
            }
          }
        });

        fileItem.appendChild(fileBtn);
        fileItem.appendChild(deleteBtn);
        fileListEl.appendChild(fileItem);
      });

      const orLabel = document.createElement('div');
      orLabel.textContent = 'OR';
      orLabel.style.cssText = `
        text-align: center;
        margin: 15px 0;
        color: var(--text-secondary);
        font-weight: 600;
      `;

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Type filename or number...';
      input.style.cssText = `
        width: 100%;
        padding: 10px;
        border: 2px solid var(--input-border);
        border-radius: 8px;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 14px;
        margin-bottom: 15px;
        box-sizing: border-box;
      `;

      const buttonGroup = document.createElement('div');
      buttonGroup.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      `;

      const okBtn = document.createElement('button');
      okBtn.textContent = 'Load';
      okBtn.style.cssText = `
        padding: 10px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
      `;

      const cleanup = () => {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      };

      okBtn.addEventListener('click', () => {
        if (input.value.trim()) {
          cleanup();
          resolve(input.value);
        }
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          cleanup();
          resolve(input.value);
        } else if (e.key === 'Escape') {
          cleanup();
          resolve(null);
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(null);
        }
      });

      buttonGroup.appendChild(cancelBtn);
      buttonGroup.appendChild(okBtn);
      content.appendChild(titleEl);
      content.appendChild(instructionsEl);
      content.appendChild(fileListEl);
      content.appendChild(orLabel);
      content.appendChild(input);
      content.appendChild(buttonGroup);
      modal.appendChild(content);
      document.body.appendChild(modal);
      
      setTimeout(() => input.focus(), 100);
    });
  }

  private showSystemPrompt(): void {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: var(--section-bg);
      color: var(--text-primary);
      padding: 30px;
      border-radius: 15px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    const title = document.createElement('h2');
    title.textContent = 'Current System Prompt';
    title.style.marginBottom = '15px';

    const promptText = document.createElement('pre');
    promptText.textContent = this.currentPrompt;
    promptText.style.cssText = `
      white-space: pre-wrap;
      word-wrap: break-word;
      background: var(--tab-bg);
      padding: 15px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      margin-top: 15px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    `;

    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Add Esc key support to close modal
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
        document.removeEventListener('keydown', handleKeyPress);
      }
    };
    document.addEventListener('keydown', handleKeyPress);

    content.appendChild(title);
    content.appendChild(promptText);
    content.appendChild(closeBtn);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }
}

class ThemeManager {
  private themeToggle: HTMLButtonElement;
  private themeIcon: HTMLElement;

  constructor() {
    this.themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
    this.themeIcon = this.themeToggle.querySelector('.theme-icon') as HTMLElement;
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.themeToggle.addEventListener('click', () => this.toggleTheme());
  }

  private toggleTheme(): void {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');
    
    if (isDark) {
      body.classList.remove('dark-mode');
      this.themeIcon.textContent = '🌙';
    } else {
      body.classList.add('dark-mode');
      this.themeIcon.textContent = '☀️';
    }
  }
}

// Global references for cross-tab communication
let globalMapApp: MapApp | null = null;
let globalOwrapApp: OwrapApp | null = null;

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing apps...');
  new ThemeManager();
  new TabManager();
  globalMapApp = new MapApp();
  new GoogleMapsApp();
  new ScriptExecutor();
  globalOwrapApp = new OwrapApp();
  console.log('Apps initialized');
});
