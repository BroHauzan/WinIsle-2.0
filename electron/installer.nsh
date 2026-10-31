!macro customInstall
  ; Register Isle Dynamic Island to run automatically at Windows startup
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "IsleDynamicIsland" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend

!macro customUnInstall
  ; Remove Windows startup registry entry on uninstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "IsleDynamicIsland"
!macroend
