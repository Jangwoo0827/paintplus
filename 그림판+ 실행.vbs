' PaintPlus dev launcher - runs "npm start" hidden, so only the app window appears (no console).
Option Explicit
Dim sh, fso, dir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
If Not fso.FolderExists(dir & "\node_modules") Then
  ' first run: install dependencies (hidden, wait until finished)
  sh.Run "cmd /c npm install", 0, True
End If
' 0 = hidden window, False = do not wait
sh.Run "cmd /c npm start", 0, False
