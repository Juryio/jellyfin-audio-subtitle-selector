// ==UserScript==
// @name         Jellyfin Japanese Audio + German Subtitles Selector v2.0
// @namespace    https://github.com/Juryio/jellyfin-audio-subtitle-selector
// @version      2.0.0
// @description  Automatische Auswahl von japanischer Video-Version, Tonspur und deutschen Untertiteln für Jellyfin (inkl. SyncPlay Support)
// @author       Juryio
// @match        http*://*/web/index.html*
// @match        http*://*/web/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Jellyfin Audio/Sub Selector v2.0] Script gestartet');

    // Konfiguration
    const CONFIG = {
        preferredAudioLanguage: 'jpn',  // Japanisch
        preferredSubtitleLanguage: 'ger', // Deutsch
        preferredVersionKeywords: ['japan', 'jpn', 'japanese', 'jap', 'German Sub'], // Keywords für japanische Version
        checkInterval: 1000, // Prüfintervall in ms
        versionSwitchDelay: 1500, // Wartezeit nach Versionswechsel
        debug: true
    };

    function log(message, ...args) {
        if (CONFIG.debug) {
            console.log(`[Jellyfin A/S Selector v2] ${message}`, ...args);
        }
    }

    // Speichert/lädt User-Präferenzen
    function savePreference(key, value) {
        try {
            localStorage.setItem(`jellyfinSelector_${key}`, JSON.stringify(value));
        } catch (e) {
            log('Fehler beim Speichern:', e);
        }
    }

    function loadPreference(key, defaultValue) {
        try {
            const stored = localStorage.getItem(`jellyfinSelector_${key}`);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    // Wartet auf Jellyfin API
    function waitForJellyfin() {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (window.ApiClient || window.Jellyfin) {
                    clearInterval(check);
                    log('Jellyfin API gefunden');
                    resolve();
                }
            }, 100);
        });
    }

    // Findet den Video-Player
    function findVideoElement() {
        return document.querySelector('video') || document.querySelector('video[id*="player"]');
    }

    // Prüft ob Item mehrere Versionen hat und wechselt zur bevorzugten
    async function switchToPreferredVersion() {
        const apiClient = window.ApiClient;
        if (!apiClient) {
            log('ApiClient nicht verfügbar');
            return false;
        }

        try {
            const playerManager = window.playerManager;
            const currentPlayer = playerManager?.currentPlayer;
            
            if (!currentPlayer?._currentPlayOptions?.item) {
                log('Kein aktiver Player oder Item');
                return false;
            }

            const currentItem = currentPlayer._currentPlayOptions.item;
            const itemId = currentItem.Id;
            
            log('Prüfe Versionen für Item:', currentItem.Name);

            // Hole detaillierte Item-Infos
            const userId = apiClient.getCurrentUserId();
            const fullItem = await apiClient.getItem(userId, itemId);
            
            if (!fullItem || !fullItem.MediaSources || fullItem.MediaSources.length <= 1) {
                log('Keine alternativen Versionen gefunden');
                return false;
            }

            log('Gefundene Versionen:', fullItem.MediaSources.map(s => ({ name: s.Name, id: s.Id, path: s.Path })));

            // Finde japanische Version
            const currentSourceId = currentPlayer._currentPlayOptions.mediaSource?.Id;
            const japaneseVersion = fullItem.MediaSources.find(source => {
                const name = (source.Name || '').toLowerCase();
                const path = (source.Path || '').toLowerCase();
                
                return CONFIG.preferredVersionKeywords.some(keyword => 
                    name.includes(keyword) || path.includes(keyword)
                );
            });

            if (!japaneseVersion) {
                log('Keine japanische Version gefunden');
                return false;
            }

            if (japaneseVersion.Id === currentSourceId) {
                log('Bereits auf japanischer Version');
                return false;
            }

            log('Wechsle zu japanischer Version:', japaneseVersion.Name || japaneseVersion.Path);

            // Hole aktuelle Position
            const currentPositionTicks = currentPlayer._currentPlayOptions.startPositionTicks || 0;

            // Erstelle neue Play-Options mit japanischer Version
            const newPlayOptions = {
                ...currentPlayer._currentPlayOptions,
                mediaSourceId: japaneseVersion.Id,
                startPositionTicks: currentPositionTicks
            };

            // Stoppe aktuelles Playback
            await currentPlayer.stop();

            // Starte mit neuer Version
            await currentPlayer.play(newPlayOptions);

            savePreference('lastUsedVersion', japaneseVersion.Id);
            log('Erfolgreich zu japanischer Version gewechselt!');
            
            return true;
        } catch (error) {
            log('Fehler beim Versionswechsel:', error);
            return false;
        }
    }

    // Wählt Audio/Subtitle Track basierend auf Sprache
    function selectTracks() {
        const video = findVideoElement();
        if (!video) {
            return false;
        }

        try {
            const playerManager = window.playerManager;
            if (!playerManager) {
                return false;
            }

            const currentPlayer = playerManager.currentPlayer;
            if (!currentPlayer) {
                return false;
            }

            const playbackInfo = currentPlayer._currentPlayOptions;
            if (!playbackInfo || !playbackInfo.mediaSource) {
                return false;
            }

            const mediaSource = playbackInfo.mediaSource;
            log('MediaSource für Track-Auswahl:', mediaSource.Name);

            // Setze japanischen Audio Track
            if (mediaSource.MediaStreams) {
                const audioStreams = mediaSource.MediaStreams.filter(s => s.Type === 'Audio');
                const japaneseAudio = audioStreams.find(s => 
                    s.Language === CONFIG.preferredAudioLanguage || 
                    s.Language === 'ja' ||
                    (s.DisplayTitle && (
                        s.DisplayTitle.includes('Japan') || 
                        s.DisplayTitle.includes('jpn')
                    ))
                );

                if (japaneseAudio) {
                    log('Japanischer Audio-Track gefunden:', japaneseAudio.DisplayTitle || japaneseAudio.Language);
                    currentPlayer.setAudioStreamIndex(japaneseAudio.Index);
                } else {
                    log('Kein japanischer Audio-Track in dieser Version');
                }

                // Setze deutsche Untertitel
                const subtitleStreams = mediaSource.MediaStreams.filter(s => s.Type === 'Subtitle');
                const germanSubtitle = subtitleStreams.find(s => 
                    s.Language === CONFIG.preferredSubtitleLanguage ||
                    s.Language === 'de' ||
                    s.Language === 'deu' ||
                    (s.DisplayTitle && (
                        s.DisplayTitle.includes('German') ||
                        s.DisplayTitle.includes('Deutsch') ||
                        s.DisplayTitle.toLowerCase().includes('ger')
                    ))
                );

                if (germanSubtitle) {
                    log('Deutsche Untertitel gefunden:', germanSubtitle.DisplayTitle || germanSubtitle.Language);
                    currentPlayer.setSubtitleStreamIndex(germanSubtitle.Index);
                } else {
                    log('Keine deutschen Untertitel in dieser Version');
                }

                return true;
            }
        } catch (error) {
            log('Fehler beim Setzen der Tracks:', error);
        }

        return false;
    }

    // Observer für DOM-Änderungen
    let lastVideoSrc = '';
    let processingVersion = false;
    
    function monitorPlayback() {
        setInterval(async () => {
            const video = findVideoElement();
            if (video && video.src && video.src !== lastVideoSrc && !processingVersion) {
                lastVideoSrc = video.src;
                log('Neues Video erkannt:', video.src.substring(0, 80) + '...');
                
                processingVersion = true;
                
                // Versuche Version zu wechseln
                const switched = await switchToPreferredVersion();
                
                if (!switched) {
                    // Falls kein Versionswechsel: Optimiere Tracks
                    setTimeout(() => {
                        selectTracks();
                        processingVersion = false;
                    }, 1000);
                } else {
                    // Nach Versionswechsel: Warte auf neue Tracks
                    setTimeout(() => {
                        selectTracks();
                        processingVersion = false;
                    }, CONFIG.versionSwitchDelay);
                }
            }
        }, CONFIG.checkInterval);
    }

    // Hook in Jellyfin's playback events
    function hookPlaybackEvents() {
        try {
            const events = window.Events || window.Emby?.Events;
            if (events) {
                events.on(window.playerManager, 'playbackstart', async () => {
                    log('Playback gestartet Event');
                    
                    if (processingVersion) {
                        log('Versionswechsel bereits in Bearbeitung');
                        return;
                    }
                    
                    processingVersion = true;
                    
                    // Warte kurz, bis Player bereit ist
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Versuche Version zu wechseln
                    const switched = await switchToPreferredVersion();
                    
                    if (!switched) {
                        // Falls kein Versionswechsel: Optimiere Tracks
                        setTimeout(() => {
                            selectTracks();
                            processingVersion = false;
                        }, 1000);
                    } else {
                        // Nach Versionswechsel: Warte auf neue Tracks
                        setTimeout(() => {
                            selectTracks();
                            processingVersion = false;
                        }, CONFIG.versionSwitchDelay);
                    }
                });

                events.on(window.playerManager, 'playbackstop', () => {
                    log('Playback gestoppt');
                    lastVideoSrc = '';
                    processingVersion = false;
                });
            }
        } catch (error) {
            log('Konnte Events nicht hooken:', error);
        }
    }

    // Initialisierung
    async function init() {
        log('Initialisiere...');
        await waitForJellyfin();
        
        // Versuche Events zu hooken
        hookPlaybackEvents();
        
        // Fallback: Polling
        monitorPlayback();
        
        log('Initialisierung abgeschlossen - v2.0 mit Versionserkennung aktiv!');
        log('Bevorzugte Version: Japanisch mit deutschen Untertiteln');
    }

    // Starte das Script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Debug-Hilfe: Zeige alle Versionen in Console
    window.jellyfinShowVersions = async function() {
        try {
            const playerManager = window.playerManager;
            const currentPlayer = playerManager?.currentPlayer;
            if (!currentPlayer?._currentPlayOptions?.item) {
                console.log('Kein aktives Video');
                return;
            }

            const itemId = currentPlayer._currentPlayOptions.item.Id;
            const fullItem = await window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), itemId);
            
            console.log('=== Verfügbare Versionen ===');
            fullItem.MediaSources.forEach((source, i) => {
                console.log(`${i + 1}. ${source.Name || 'Unnamed'}`);
                console.log(`   ID: ${source.Id}`);
                console.log(`   Path: ${source.Path}`);
                console.log(`   ---`);
            });
        } catch (error) {
            console.error('Fehler:', error);
        }
    };

    console.log('[Jellyfin Selector] Tipp: Nutze jellyfinShowVersions() in der Console um alle Versionen zu sehen');
})();
