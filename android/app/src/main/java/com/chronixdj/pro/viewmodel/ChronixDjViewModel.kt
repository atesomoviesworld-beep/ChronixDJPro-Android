package com.chronixdj.pro.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chronixdj.pro.audio.DjAudioEngine
import com.chronixdj.pro.audio.SamplerEngine
import com.chronixdj.pro.audio.StemsAudioEngine
import com.chronixdj.pro.data.PreferencesRepository
import com.chronixdj.pro.model.AppSection
import com.chronixdj.pro.model.DeckId
import com.chronixdj.pro.model.DjSettings
import com.chronixdj.pro.model.FxType
import com.chronixdj.pro.model.MasterCenterMode
import com.chronixdj.pro.model.PadMode
import com.chronixdj.pro.model.RecordingMode
import com.chronixdj.pro.model.RecordingState
import com.chronixdj.pro.model.StemType
import com.chronixdj.pro.permissions.StoragePermissionHelper
import com.chronixdj.pro.permissions.StoragePermissionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ChronixDjViewModel(application: Application) : AndroidViewModel(application) {

    private val prefsRepo = PreferencesRepository(application)

    private val _currentSection = MutableStateFlow(AppSection.MASTER)
    val currentSection: StateFlow<AppSection> = _currentSection.asStateFlow()

    private val _masterCenterMode = MutableStateFlow(MasterCenterMode.WAVEFORM)
    val masterCenterMode: StateFlow<MasterCenterMode> = _masterCenterMode.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _permissionStatus = MutableStateFlow(StoragePermissionHelper.checkPermissions(application))
    val permissionStatus: StateFlow<StoragePermissionStatus> = _permissionStatus.asStateFlow()

    private val _padModes = MutableStateFlow(mapOf(DeckId.DECK_A to PadMode.STEMS, DeckId.DECK_B to PadMode.CUE))
    val padModes: StateFlow<Map<DeckId, PadMode>> = _padModes.asStateFlow()

    private val _cueDeleteMode = MutableStateFlow(mapOf(DeckId.DECK_A to false, DeckId.DECK_B to false))
    val cueDeleteMode: StateFlow<Map<DeckId, Boolean>> = _cueDeleteMode.asStateFlow()

    val settings: StateFlow<DjSettings> = prefsRepo.settingsFlow
        .stateIn(viewModelScope, SharingStarted.Eagerly, DjSettings())

    val audioEngine = DjAudioEngine(application, viewModelScope) { msg ->
        _errorMessage.value = msg
    }

    val recordingState: StateFlow<RecordingState> = audioEngine.recordingState

    val stemsEngine = StemsAudioEngine(application, viewModelScope) { msg ->
        _errorMessage.value = msg
    }

    val samplerEngine = SamplerEngine(application, viewModelScope) { msg ->
        _errorMessage.value = msg
    }

    init {
        viewModelScope.launch {
            settings.collect { s ->
                audioEngine.updateSettings(s)
            }
        }
    }

    fun selectSection(section: AppSection) {
        _currentSection.value = section
    }

    fun selectMasterCenterMode(mode: MasterCenterMode) {
        _masterCenterMode.value = mode
    }

    fun refreshPermissions() {
        _permissionStatus.value = StoragePermissionHelper.checkPermissions(getApplication())
    }

    fun dismissError() {
        _errorMessage.value = null
    }

    fun setCrossfader(value: Float) {
        audioEngine.setCrossfader(value)
    }

    fun animateCrossfaderTo(target: Float, durationMs: Long = 2200L) {
        audioEngine.animateCrossfaderTo(target, durationMs)
    }

    fun setMasterVolume(value: Float) {
        audioEngine.setMasterVolume(value)
    }

    fun setPadMode(deckId: DeckId, mode: PadMode) {
        _padModes.value = _padModes.value + (deckId to mode)
    }

    fun toggleCueDeleteMode(deckId: DeckId) {
        val curr = _cueDeleteMode.value[deckId] ?: false
        _cueDeleteMode.value = _cueDeleteMode.value + (deckId to !curr)
    }

    fun setRecordingMode(mode: RecordingMode) = audioEngine.setRecordingMode(mode)
    fun startRecording() = audioEngine.startRecording()
    fun pauseRecording() = audioEngine.pauseRecording()
    fun resumeRecording() = audioEngine.resumeRecording()
    fun stopRecording() = audioEngine.stopRecording()
    fun saveRecording() {
        audioEngine.saveRecording { msg -> _errorMessage.value = msg }
    }
    fun clearSavedRecording() = audioEngine.clearSavedRecording()

    fun loadAudioTrack(deckId: DeckId, uri: Uri) = audioEngine.loadTrack(deckId, uri)
    fun loadVideoTrack(deckId: DeckId, uri: Uri) = audioEngine.loadTrack(deckId, uri)
    fun loadStemFile(stemType: StemType, uri: Uri) = stemsEngine.loadStemFile(stemType, uri)

    fun setFxSlotType(deckId: DeckId, index: Int, type: FxType) = audioEngine.setFxSlotType(deckId, index, type)

    fun updateSettings(transform: (DjSettings) -> DjSettings) {
        viewModelScope.launch { prefsRepo.updateSettings(transform) }
    }

    fun setDefaultMusicFolder(uri: Uri) {
        StoragePermissionHelper.takePersistableReadPermission(getApplication(), uri)
        val name = StoragePermissionHelper.resolveDisplayName(getApplication(), uri)
        updateSettings { it.copy(defaultMusicFolderUri = uri.toString(), defaultMusicFolderName = name) }
    }

    fun resetPreferences() {
        viewModelScope.launch { prefsRepo.resetAll() }
    }

    fun addOrReplaceSampler(padId: String?, uri: Uri) {
        if (padId == null) {
            samplerEngine.addCustomSampler(uri)
        } else {
            samplerEngine.replaceSampler(padId, uri)
        }
    }

    override fun onCleared() {
        super.onCleared()
        audioEngine.release()
        stemsEngine.release()
        samplerEngine.release()
    }
}
