package com.chronixdj.pro

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chronixdj.pro.model.AppSection
import com.chronixdj.pro.model.DeckId
import com.chronixdj.pro.model.StemType
import com.chronixdj.pro.permissions.StoragePermissionHelper
import com.chronixdj.pro.ui.screens.MasterScreen
import com.chronixdj.pro.ui.screens.SettingsScreen
import com.chronixdj.pro.ui.screens.StemsScreen
import com.chronixdj.pro.ui.screens.VideoScreen
import com.chronixdj.pro.ui.theme.ChronixColors
import com.chronixdj.pro.ui.theme.ChronixDJProTheme
import com.chronixdj.pro.viewmodel.ChronixDjViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            ChronixDJProTheme {
                val vm: ChronixDjViewModel = viewModel()
                val section by vm.currentSection.collectAsState()
                val centerMode by vm.masterCenterMode.collectAsState()
                val deckA by vm.audioEngine.deckA.collectAsState()
                val deckB by vm.audioEngine.deckB.collectAsState()
                val crossfader by vm.audioEngine.crossfader.collectAsState()
                val masterVolume by vm.audioEngine.masterVolume.collectAsState()
                val padModes by vm.padModes.collectAsState()
                val cueDelete by vm.cueDeleteMode.collectAsState()
                val recordingState by vm.recordingState.collectAsState()
                val stems by vm.stemsEngine.channels.collectAsState()
                val settings by vm.settings.collectAsState()
                val permissions by vm.permissionStatus.collectAsState()
                val errorMessage by vm.errorMessage.collectAsState()

                val snackbarHostState = remember { SnackbarHostState() }
                var pendingAudioDeck by remember { mutableStateOf<DeckId?>(null) }
                var pendingVideoDeck by remember { mutableStateOf<DeckId?>(null) }
                var pendingStemType by remember { mutableStateOf<StemType?>(null) }
                var pendingSamplerPadId by remember { mutableStateOf<String?>(null) }

                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions()
                ) {
                    vm.refreshPermissions()
                }

                val audioPicker = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri: Uri? ->
                    val target = pendingAudioDeck
                    if (uri != null && target != null) {
                        vm.loadAudioTrack(target, uri)
                    }
                    pendingAudioDeck = null
                }

                val videoPicker = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri: Uri? ->
                    val target = pendingVideoDeck
                    if (uri != null && target != null) {
                        vm.loadVideoTrack(target, uri)
                    }
                    pendingVideoDeck = null
                }

                val stemPicker = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri: Uri? ->
                    val target = pendingStemType
                    if (uri != null && target != null) {
                        vm.loadStemFile(target, uri)
                    }
                    pendingStemType = null
                }

                val samplerPicker = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument()
                ) { uri: Uri? ->
                    if (uri != null) {
                        vm.addOrReplaceSampler(pendingSamplerPadId, uri)
                    }
                    pendingSamplerPadId = null
                }

                val folderPicker = rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocumentTree()
                ) { uri: Uri? ->
                    if (uri != null) vm.setDefaultMusicFolder(uri)
                }

                LaunchedEffect(Unit) {
                    if (!permissions.allGranted) {
                        permissionLauncher.launch(StoragePermissionHelper.requiredPermissions())
                    }
                }

                LaunchedEffect(errorMessage) {
                    errorMessage?.let { msg ->
                        snackbarHostState.showSnackbar(msg)
                        vm.dismissError()
                    }
                }

                Scaffold(
                    containerColor = ChronixColors.Background,
                    snackbarHost = { SnackbarHost(snackbarHostState) }
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        when (section) {
                            AppSection.MASTER -> MasterScreen(
                                deckA = deckA,
                                deckB = deckB,
                                crossfader = crossfader,
                                masterVolume = masterVolume,
                                centerMode = centerMode,
                                padModes = padModes,
                                cueDeleteMode = cueDelete,
                                recordingState = recordingState,
                                settings = settings,
                                viewModel = vm,
                                onPickAudio = { deckId ->
                                    pendingAudioDeck = deckId
                                    audioPicker.launch(arrayOf("audio/*", "video/*"))
                                },
                                onPickSamplerAudio = { padId ->
                                    pendingSamplerPadId = padId
                                    samplerPicker.launch(arrayOf("audio/*"))
                                },
                                onNavigateSection = vm::selectSection
                            )
                            AppSection.VIDEO -> VideoScreen(
                                deckA = deckA,
                                deckB = deckB,
                                crossfader = crossfader,
                                viewModel = vm,
                                onPickMedia = { deckId ->
                                    pendingVideoDeck = deckId
                                    videoPicker.launch(arrayOf("video/*", "audio/*"))
                                },
                                onNavigateSection = vm::selectSection
                            )
                            AppSection.STEMS -> StemsScreen(
                                channels = stems,
                                viewModel = vm,
                                onPickStemFile = { stemType ->
                                    pendingStemType = stemType
                                    stemPicker.launch(arrayOf("audio/*"))
                                },
                                onNavigateSection = vm::selectSection
                            )
                            AppSection.SETTINGS -> SettingsScreen(
                                settings = settings,
                                permissions = permissions,
                                viewModel = vm,
                                onRequestPermissions = {
                                    permissionLauncher.launch(StoragePermissionHelper.requiredPermissions())
                                },
                                onPickDefaultFolder = { folderPicker.launch(null) },
                                onNavigateSection = vm::selectSection
                            )
                        }
                    }
                }
            }
        }
    }
}
