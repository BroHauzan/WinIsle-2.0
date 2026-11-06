!macro customInstall
  ; Register WinIsle to run automatically at Windows startup (Task Manager Startup Apps & HKCU Run)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WinIsle" '"$INSTDIR\WinIsle.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "IsleDynamicIsland" '"$INSTDIR\WinIsle.exe"'

  ; Also create shortcut in User Startup folder for 100% startup reliability across all Windows editions
  CreateShortcut "$SMSTARTUP\WinIsle.lnk" "$INSTDIR\WinIsle.exe" "" "$INSTDIR\WinIsle.exe" 0
!macroend

!macro customUnInstall
  ; Clean up Windows startup registry entries and shortcut on uninstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "WinIsle"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "IsleDynamicIsland"
  Delete "$SMSTARTUP\WinIsle.lnk"
  Delete "$SMSTARTUP\IsleDynamicIsland.lnk"
!macroend
