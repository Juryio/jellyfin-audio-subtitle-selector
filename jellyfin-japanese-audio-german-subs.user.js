// ==UserScript==
// @name         Jellyfin Japanese Audio + German Subtitles Selector
// @namespace    https://github.com/Juryio/jellyfin-audio-subtitle-selector
// @version      1.0.0
// @description  Automatische Auswahl von japanischer Tonspur und deutschen Untertiteln für Jellyfin
// @author       Juryio
// @match        http*://*/web/index.html*
// @match        http*://*/web/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Jellyfin Audio/Sub Selector] Script gestartet');

    // Konfiguration
    const CONFIG = {
        preferredAudioLanguage: 'jpn',  // Japanisch
        preferredSubtitleLanguage: 'ger', // Deutsch
        checkInterval: 1000, // Prüfintervall in ms
        debug: true
    };

    function log(message, ...args) {
        if (CONFIG.debug) {
            console.log(`[Jellyfin A/S Selector] ${message}`, ...args);
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

    // Wählt Audio/Subtitle Track basierend auf Sprache
    function selectTracks() {
        const video = findVideoElement();
        if (!video) {
            return false;
        }

        try {
            // Prüfe auf Jellyfin Player API
            const playerManager = window.playerManager;
            if (!playerManager) {
                return false;
            }

            const currentPlayer = playerManager.currentPlayer;
            if (!currentPlayer) {
                return false;
            }

            // Hole verfügbare Audio/Subtitle Tracks
            const playbackInfo = currentPlayer._currentPlayOptions;
            if (!playbackInfo || !playbackInfo.mediaSource) {
                return false;
            }

            const mediaSource = playbackInfo.mediaSource;
            log('MediaSource gefunden', mediaSource);

            // Setze japanischen Audio Track
            if (mediaSource.MediaStreams) {
                const audioStreams = mediaSource.MediaStreams.filter(s => s.Type === 'Audio');
                const japaneseAudio = audioStreams.find(s => 
                    s.Language === CONFIG.preferredAudioLanguage || 
                    s.Language === 'ja' ||
                    s.DisplayTitle?.includes('Japan')
                );

                if (japaneseAudio) {
                    log('Japanischer Audio-Track gefunden', japaneseAudio);
                    currentPlayer.setAudioStreamIndex(japaneseAudio.Index);
                }

                // Setze deutsche Untertitel
                const subtitleStreams = mediaSource.MediaStreams.filter(s => s.Type === 'Subtitle');
                const germanSubtitle = subtitleStreams.find(s => 
                    s.Language === CONFIG.preferredSubtitleLanguage ||
                    s.Language === 'de' ||
                    s.DisplayTitle?.includes('German') ||
                    s.DisplayTitle?.includes('Deutsch')
                );

                if (germanSubtitle) {
                    log('Deutsche Untertitel gefunden', germanSubtitle);
                    currentPlayer.setSubtitleStreamIndex(germanSubtitle.Index);
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
    function monitorPlayback() {
        setInterval(() => {
            const video = findVideoElement();
            if (video && video.src && video.src !== lastVideoSrc) {
                lastVideoSrc = video.src;
                log('Neues Video erkannt, setze Tracks...');
                
                // Warte kurz, bis Tracks geladen sind
                setTimeout(() => {
                    selectTracks();
                }, 500);
            }
        }, CONFIG.checkInterval);
    }

    // Hook in Jellyfin's playback events
    function hookPlaybackEvents() {
        try {
            // Warte auf Events vom Player
            const events = window.Events || window.Emby?.Events;
            if (events) {
                events.on(window.playerManager, 'playbackstart', () => {
                    log('Playback gestartet, setze Tracks...');
                    setTimeout(() => selectTracks(), 1000);
                });

                events.on(window.playerManager, 'playbackstop', () => {
                    log('Playback gestoppt');
                    lastVideoSrc = '';
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
        
        log('Initialisierung abgeschlossen');
    }

    // Starte das Script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
