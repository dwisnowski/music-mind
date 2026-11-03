require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'MusicMindCoreMidi'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'MIT'
  s.homepage = 'https://www.wildideazone.com/projects/music-mind'
  s.author = 'Wild Idea Zone'
  s.source = { :git => 'https://github.com/dwisnowski/music-mind.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/CoreMidiPlugin/**/*.{swift,h,m,c,cc,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
  s.frameworks = 'CoreMIDI', 'CoreAudioKit'
end
